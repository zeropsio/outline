import { Share } from "@server/models";
import { presentUser } from ".";

export default function present(share: Share, isAdmin = false) {
  const data = {
    id: share.id,
    documentId: share.documentId,
    documentTitle: share.document?.title,
    documentUrl: share.document?.url,
    published: share.published,
    url: share.canonicalUrl,
    createdBy: presentUser(share.user),
    includeChildDocuments: share.includeChildDocuments,
    lastAccessedAt: share.lastAccessedAt || undefined,
    views: share.views || 0,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  };

  if (!isAdmin) {
    delete data.lastAccessedAt;
  }

  return data;
}
