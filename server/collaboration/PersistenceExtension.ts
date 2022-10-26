import {
  onStoreDocumentPayload,
  onLoadDocumentPayload,
  onChangePayload,
  Extension,
} from "@hocuspocus/server";
import * as Y from "yjs";
import { sequelize } from "@server/database/sequelize";
import Logger from "@server/logging/Logger";
import { APM } from "@server/logging/tracing";
import Document from "@server/models/Document";
import documentCollaborativeUpdater from "../commands/documentCollaborativeUpdater";
import markdownToYDoc from "./utils/markdownToYDoc";

@APM.trace({
  spanName: "persistence",
})
export default class PersistenceExtension implements Extension {
  /**
   * Map of documentId -> userIds that have modified the document since it
   * was last persisted to the database. The map is cleared on every save.
   */
  documentCollaboratorIds = new Map<string, Set<string>>();

  async onLoadDocument({ documentName, ...data }: onLoadDocumentPayload) {
    const [, documentId] = documentName.split(".");
    const fieldName = "default";

    // Check if the given field already exists in the given y-doc. This is import
    // so we don't import a document fresh if it exists already.
    if (!data.document.isEmpty(fieldName)) {
      return;
    }

    return await sequelize.transaction(async (transaction) => {
      const document = await Document.scope("withState").findOne({
        transaction,
        lock: transaction.LOCK.UPDATE,
        rejectOnEmpty: true,
        where: {
          id: documentId,
        },
      });

      if (document.state) {
        const ydoc = new Y.Doc();
        Logger.info("database", `Document ${documentId} is in database state`);
        Y.applyUpdate(ydoc, document.state);
        return ydoc;
      }

      Logger.info(
        "database",
        `Document ${documentId} is not in state, creating from markdown`
      );
      const ydoc = markdownToYDoc(document.text, fieldName);
      const state = Y.encodeStateAsUpdate(ydoc);
      await document.update(
        {
          state: Buffer.from(state),
        },
        {
          silent: true,
          hooks: false,
          transaction,
        }
      );
      return ydoc;
    });
  }

  async onChange({ context, documentName }: onChangePayload) {
    Logger.debug(
      "multiplayer",
      `${context.user?.name} changed ${documentName}`
    );

    const state = this.documentCollaboratorIds.get(documentName) ?? new Set();
    state.add(context.user?.id);
    this.documentCollaboratorIds.set(documentName, state);
  }

  async onStoreDocument({
    document,
    context,
    documentName,
  }: onStoreDocumentPayload) {
    const [, documentId] = documentName.split(".");

    // Find the collaborators that have modified the document since it was last
    // persisted and clear the map.
    const documentCollaboratorIds = this.documentCollaboratorIds.get(
      documentName
    );
    const collaboratorIds = documentCollaboratorIds
      ? Array.from(documentCollaboratorIds.values())
      : [context.user?.id];
    this.documentCollaboratorIds.delete(documentName);

    try {
      await documentCollaborativeUpdater({
        documentId,
        ydoc: document,
        // TODO: Right now we're attributing all changes to the last editor,
        // It would be nice in the future to have multiple editors per revision.
        userId: collaboratorIds.pop(),
      });
    } catch (err) {
      Logger.error("Unable to persist document", err, {
        documentId,
        userId: context.user?.id,
      });
    }
  }
}
