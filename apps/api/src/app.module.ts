import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { NotificationsController, TaskTransverseController } from "./task-transverse.controller.js";
import { PrivateController } from "./private.controller.js";
import { TasksController } from "./tasks.controller.js";
import { WorkspacesController } from "./workspaces.controller.js";

@Module({
  controllers: [
    HealthController,
    PrivateController,
    WorkspacesController,
    TasksController,
    TaskTransverseController,
    NotificationsController,
  ],
})
export class AppModule {}
