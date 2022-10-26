import Router from "koa-router";
import { Sequelize } from "sequelize";
import starCreator from "@server/commands/starCreator";
import starDestroyer from "@server/commands/starDestroyer";
import starUpdater from "@server/commands/starUpdater";
import { sequelize } from "@server/database/sequelize";
import auth from "@server/middlewares/authentication";
import { Document, Star, Collection } from "@server/models";
import { authorize } from "@server/policies";
import {
  presentStar,
  presentDocument,
  presentPolicies,
} from "@server/presenters";
import { starIndexing } from "@server/utils/indexing";
import { assertUuid, assertIndexCharacters } from "@server/validation";
import pagination from "./middlewares/pagination";

const router = new Router();

router.post("stars.create", auth(), async (ctx) => {
  const { documentId, collectionId } = ctx.request.body;
  const { index } = ctx.request.body;
  const { user } = ctx.state;

  assertUuid(
    documentId || collectionId,
    "documentId or collectionId is required"
  );

  if (documentId) {
    const document = await Document.findByPk(documentId, {
      userId: user.id,
    });
    authorize(user, "star", document);
  }

  if (collectionId) {
    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(collectionId);
    authorize(user, "star", collection);
  }

  if (index) {
    assertIndexCharacters(index);
  }

  const star = await sequelize.transaction(async (transaction) =>
    starCreator({
      user,
      documentId,
      collectionId,
      ip: ctx.request.ip,
      index,
      transaction,
    })
  );
  ctx.body = {
    data: presentStar(star),
    policies: presentPolicies(user, [star]),
  };
});

router.post("stars.list", auth(), pagination(), async (ctx) => {
  const { user } = ctx.state;

  const [stars, collectionIds] = await Promise.all([
    Star.findAll({
      where: {
        userId: user.id,
      },
      order: [
        Sequelize.literal('"star"."index" collate "C"'),
        ["updatedAt", "DESC"],
      ],
      offset: ctx.state.pagination.offset,
      limit: ctx.state.pagination.limit,
    }),
    user.collectionIds(),
  ]);

  const nullIndex = stars.findIndex((star) => star.index === null);

  if (nullIndex !== -1) {
    const indexedStars = await starIndexing(user.id);
    stars.forEach((star) => {
      star.index = indexedStars[star.id];
    });
  }

  const documentIds = stars
    .map((star) => star.documentId)
    .filter(Boolean) as string[];
  const documents = documentIds.length
    ? await Document.defaultScopeWithUser(user.id).findAll({
        where: {
          id: documentIds,
          collectionId: collectionIds,
        },
      })
    : [];

  const policies = presentPolicies(user, [...documents, ...stars]);

  ctx.body = {
    pagination: ctx.state.pagination,
    data: {
      stars: stars.map(presentStar),
      documents: await Promise.all(
        documents.map((document: Document) => presentDocument(document))
      ),
    },
    policies,
  };
});

router.post("stars.update", auth(), async (ctx) => {
  const { id, index } = ctx.request.body;
  assertUuid(id, "id is required");

  assertIndexCharacters(index);

  const { user } = ctx.state;
  let star = await Star.findByPk(id);
  authorize(user, "update", star);

  star = await starUpdater({
    user,
    star,
    ip: ctx.request.ip,
    index,
  });

  ctx.body = {
    data: presentStar(star),
    policies: presentPolicies(user, [star]),
  };
});

router.post("stars.delete", auth(), async (ctx) => {
  const { id } = ctx.request.body;
  assertUuid(id, "id is required");

  const { user } = ctx.state;
  const star = await Star.findByPk(id);
  authorize(user, "delete", star);

  await starDestroyer({ user, star, ip: ctx.request.ip });

  ctx.body = {
    success: true,
  };
});

export default router;
