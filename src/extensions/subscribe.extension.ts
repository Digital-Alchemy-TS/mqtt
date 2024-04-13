import { TServiceParams } from "@digital-alchemy/core";

import { MQTTSubscribeOptions } from "..";

export function Subscribe({ mqtt }: TServiceParams) {
  return function <DATA = unknown>(options: MQTTSubscribeOptions<DATA>): void {
    mqtt.bindings.subscribe(options);
  };
}
