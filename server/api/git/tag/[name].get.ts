import { isGitRepositorySync, getTagDetail } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const name = getRouterParam(event, "name");
    const query = getQuery(event);
    const workingDirectory =
      (query.workingDirectory as string) || getProjectDir();

    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tag name is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      const detail = getTagDetail(workingDirectory, name);
      return detail;
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to get tag detail: ${errorMessage}`,
      });
    }
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error fetching tag detail", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch tag detail",
    });
  }
});
