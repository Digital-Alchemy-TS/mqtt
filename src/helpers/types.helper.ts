import { TBlackHole, TContext } from "@digital-alchemy/core";
import { Packet } from "mqtt";

export type MqttMessageTransformer = (payload: Buffer) => unknown;

export interface MqttSubscriberParameter {
  index: number;
  transform?: "json" | "text" | MqttMessageTransformer;
  type: "payload" | "topic" | "packet" | "params";
}

export type MQTTParseFormat = "none" | "json";

export interface SubscriptionOptions {
  noLocal?: boolean;
  qualityOfService?: number;
  retainAsPublished?: boolean;
  retainHandling?: number;
}

export type MQTTSubscribeOptions<DATA = unknown> = {
  topic: string | string[];
  exec: MqttCallback<DATA>;
  context: TContext;
  parse?: MQTTParseFormat;
  options?: SubscriptionOptions;
};

export type MqttCallback<DATA = unknown> = (payload: DATA, packet?: Packet) => TBlackHole;
