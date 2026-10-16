import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { PrivateController } from "./private.controller.js";
import { TasksController } from "./tasks.controller.js";
import { WorkspacesController } from "./workspaces.controller.js";

@Module({ controllers: [HealthController, PrivateController, WorkspacesController, TasksController] })
export class AppModule {}
