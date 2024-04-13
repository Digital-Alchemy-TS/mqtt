import { each, InternalError, is, TServiceParams } from "@digital-alchemy/core";
import {
  connectAsync,
  IClientPublishOptions,
  IClientSubscribeOptions,
  ISubscriptionGrant,
  MqttClient,
  Packet,
} from "mqtt";
import { QoS } from "mqtt-packet";

import {
  MQTT_MESSAGE_ERRORS,
  MQTT_MESSAGE_EXECUTIONS,
  MQTT_MESSAGE_HANDLING_TIME,
  MQTT_RECONNECT,
  MqttCallback,
  MQTTParseFormat,
  MQTTSubscribeOptions,
  SubscriptionOptions,
} from "..";

// Function to translate readable options to MQTT options
function translateOptions(
  options: SubscriptionOptions,
): IClientSubscribeOptions {
  return {
    nl: options.noLocal,
    qos: options.qualityOfService as QoS,
    rap: options.retainAsPublished,
    rh: options.retainHandling,
  };
}

export function MQTT_Bindings({
  logger,
  lifecycle,
  config,
  internal,
  context: bindingsContext,
  event,
}: TServiceParams) {
  let client: MqttClient;

  const CALLBACKS = new Map<string, MqttCallback[]>();
  const MESSAGE_PARSE = new Map<string, MQTTParseFormat>();
  const TOPIC_REGEX = new Map<string, RegExp>();

  lifecycle.onPostConfig(async () => {
    client = await connectAsync({
      ...config.mqtt.CLIENT_OPTIONS,
    });
    logger.info("mqtt connected");
    logEvents();
    initRouting();
  });

  lifecycle.onShutdownStart(async () => {
    logger.info(`terminating mqtt connection`);
    await new Promise<void>(done => client.end(() => done()));
    client = undefined;
  });

  function logEvents() {
    client.on("reconnect", () => {
      logger.info("mqtt reconnect");
    });
    client.on("end", () => {
      logger.info("mqtt end");
    });
    client.on("error", error => {
      logger.error({ error }, "mqtt error");
      event.emit(MQTT_RECONNECT);
    });
    client.on("close", () => {
      logger.info("mqtt close");
    });
  }

  function listen(
    topics: string | string[],
    options?: IClientSubscribeOptions,
  ): Promise<ISubscriptionGrant[]> {
    return new Promise((resolve, reject) => {
      topics = is.string(topics) ? [topics] : topics;
      topics = topics.filter(topic => !TOPIC_REGEX.has(topic));
      if (is.empty(topics)) {
        resolve([]);
        return;
      }
      (topics as string[]).forEach(topic => {
        logger.debug({ topic }, `subscribe topic`);
        TOPIC_REGEX.set(
          topic,
          new RegExp(
            `^${topic
              .split("/")
              .map(part => {
                if (part === "+") {
                  return "[^/]+";
                }
                if (part === "#") {
                  return "(.*)";
                }
                return part;
              })
              .join("/")}$`,
          ),
        );
      });
      client.subscribe(topics, options, (error, granted) => {
        if (error) {
          return reject(error);
        }
        resolve(granted);
      });
    });
  }

  function initRouting() {
    client.on(
      "message",
      async (topic: string, payload: Buffer, packet: Packet) => {
        const topicMatches = [...CALLBACKS.keys()].filter(i =>
          TOPIC_REGEX.get(i).test(topic),
        );
        // Blast through everything all at once
        let parseTracker: MQTTParseFormat;
        await each(topicMatches, async topicMatch => {
          const parseFormat = MESSAGE_PARSE.get(topicMatch);
          if (is.empty(parseTracker)) {
            parseTracker = parseFormat;
          } else if (parseTracker !== parseFormat) {
            // An extra sanity check
            logger.warn(
              {
                currentFormat: parseFormat,
                firstFormat: parseTracker,
                topic,
                topicMatches,
              },
              `message has multiple topic matches, with different parse formats`,
            );
          }
          await each(CALLBACKS.get(topicMatch), async exec => {
            await exec(
              parseMessage(payload.toString("utf8"), parseFormat),
              packet,
            );
          });
        });
      },
    );
  }

  function publish(
    topic: string,
    message?: string | Buffer | object | Array<unknown>,
    options?: IClientPublishOptions,
  ): Promise<Packet> {
    return new Promise<Packet>((resolve, reject) => {
      if (is.object(message)) {
        message = JSON.stringify(message);
      }
      client.publish(topic, message ?? "", options, (error, packet) => {
        if (error) {
          return reject(error);
        }
        resolve(packet);
      });
    });
  }

  function subscribe<DATA = unknown>({
    topic,
    exec,
    context = bindingsContext,
    label,
    parse = "none",
    options = {},
  }: MQTTSubscribeOptions<DATA>): void {
    lifecycle.onBootstrap(() => {
      [topic].flat().forEach(topic => {
        // If multiple things subscribe, they must all agree on the data format
        if (MESSAGE_PARSE.has(topic)) {
          const current = MESSAGE_PARSE.get(topic);
          if (current !== parse) {
            throw new InternalError(
              bindingsContext,
              "MISMATCHED_PARSING",
              `${topic} currently has parse format of ${current}, conflicting with with ${parse}`,
            );
          }
          return;
        }
        MESSAGE_PARSE.set(topic, parse);
        listen(topic, { ...translateOptions(options), qos: 1 });
        const callbacks = CALLBACKS.get(topic) ?? ([] as MqttCallback[]);
        callbacks.push(async (message, packet) => {
          await internal.safeExec({
            duration: MQTT_MESSAGE_HANDLING_TIME,
            errors: MQTT_MESSAGE_EXECUTIONS,
            exec: async () => await exec(message as DATA, packet),
            executions: MQTT_MESSAGE_ERRORS,
            labels: { context, label, topic },
          });
        });
        CALLBACKS.set(topic, callbacks);
      });
    });
  }

  function parseMessage(message: string, format: MQTTParseFormat) {
    try {
      if (format === "json") {
        return JSON.parse(message);
      }
      return message;
    } catch (error) {
      logger.error({ error, format }, `failed to parse mqtt message`);
      return message;
    }
  }

  return {
    getClient: () => client,
    publish,
    subscribe,
  };
}
