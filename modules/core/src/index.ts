export {
  createWorkspaceForUser,
  type CreateWorkspaceInput,
  type CreatedWorkspace,
} from "./workspace.js";

export {
  createProject,
  createScope,
  getProject,
  getScope,
  InvalidParentContextError,
  listProjects,
  listScopes,
  type CreatedProject,
  type CreatedScope,
  type ProjectSummary,
  type ScopeSummary,
} from "./context-entities.js";

export {
  disableWorkspaceModule,
  enableWorkspaceModule,
  isWorkspaceModuleEnabled,
  listWorkspaceModules,
} from "./module-registry.js";
