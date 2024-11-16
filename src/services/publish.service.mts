import { TServiceParams } from "@digital-alchemy/core";
import { IClientPublishOptions, Packet } from "mqtt";

export function Publish({ mqtt }: TServiceParams) {
  return async function (
    topic: string,
    message?: string | Buffer | object | Array<unknown>,
    options?: IClientPublishOptions,
  ): Promise<Packet> {
    return await mqtt.bindings.publish(topic, message, options);
  };
}
