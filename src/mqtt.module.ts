import { CreateLibrary } from "@digital-alchemy/core";
import { IClientOptions } from "mqtt";

import { MQTT_Bindings } from "./extensions";

export const LIB_MQTT = CreateLibrary({
  configuration: {
    CLIENT_OPTIONS: {
      default: {
        host: "localhost",
        password: undefined,
        port: 1883,
      } as IClientOptions,
      description: "See IClientOptions in mqtt npm package",
      type: "internal",
    },
  },
  name: "mqtt",
  services: {
    bindings: MQTT_Bindings,
  },
});

declare module "@digital-alchemy/core" {
  export interface LoadedModules {
    mqtt: typeof LIB_MQTT;
  }
}
