import DocumentNotificationEmail from "@server/emails/templates/DocumentNotificationEmail";
import {
  View,
  NotificationSetting,
  Subscription,
  Event,
  Notification,
  Revision,
} from "@server/models";
import {
  buildDocument,
  buildCollection,
  buildUser,
} from "@server/test/factories";
import { setupTestDatabase } from "@server/test/support";
import NotificationsProcessor from "./NotificationsProcessor";

jest.mock("@server/emails/templates/DocumentNotificationEmail");
const ip = "127.0.0.1";

setupTestDatabase();

beforeEach(async () => {
  jest.resetAllMocks();
});

describe("documents.publish", () => {
  test("should not send a notification to author", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      lastModifiedById: user.id,
    });
    await NotificationSetting.create({
      userId: user.id,
      teamId: user.teamId,
      event: "documents.publish",
    });

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(DocumentNotificationEmail.schedule).not.toHaveBeenCalled();
  });

  test("should send a notification to other users in team", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
    });
    await NotificationSetting.create({
      userId: user.id,
      teamId: user.teamId,
      event: "documents.publish",
    });

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(DocumentNotificationEmail.schedule).toHaveBeenCalled();
  });

  test("should send only one notification in a 12-hour window", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      createdById: user.id,
      lastModifiedById: user.id,
    });

    const recipient = await buildUser({
      teamId: user.teamId,
    });

    await NotificationSetting.create({
      userId: recipient.id,
      teamId: recipient.teamId,
      event: "documents.publish",
    });

    await Notification.create({
      actorId: user.id,
      userId: recipient.id,
      documentId: document.id,
      teamId: recipient.teamId,
      event: "documents.publish",
      emailedAt: new Date(),
    });

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(DocumentNotificationEmail.schedule).not.toHaveBeenCalled();
  });

  test("should not send a notification to users without collection access", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      permission: null,
    });
    const document = await buildDocument({
      teamId: user.teamId,
      collectionId: collection.id,
    });
    await NotificationSetting.create({
      userId: user.id,
      teamId: user.teamId,
      event: "documents.publish",
    });
    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "documents.publish",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
      data: {
        title: document.title,
      },
      ip,
    });
    expect(DocumentNotificationEmail.schedule).not.toHaveBeenCalled();
  });
});

describe("revisions.create", () => {
  test("should send a notification to other collaborators", async () => {
    const document = await buildDocument();
    await Revision.createFromDocument(document);

    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    document.collaboratorIds = [collaborator.id];
    await document.save();
    await NotificationSetting.create({
      userId: collaborator.id,
      teamId: collaborator.teamId,
      event: "documents.update",
    });
    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });
    expect(DocumentNotificationEmail.schedule).toHaveBeenCalled();
  });

  test("should not send a notification if viewed since update", async () => {
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    document.collaboratorIds = [collaborator.id];
    await document.save();
    await NotificationSetting.create({
      userId: collaborator.id,
      teamId: collaborator.teamId,
      event: "documents.update",
    });
    await View.touch(document.id, collaborator.id, true);

    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });
    expect(DocumentNotificationEmail.schedule).not.toHaveBeenCalled();
  });

  test("should not send a notification to last editor", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      lastModifiedById: user.id,
    });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    await NotificationSetting.create({
      userId: user.id,
      teamId: user.teamId,
      event: "documents.update",
    });
    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: user.id,
      modelId: revision.id,
      ip,
    });
    expect(DocumentNotificationEmail.schedule).not.toHaveBeenCalled();
  });

  test("should send a notification for subscriptions, even to collaborator", async () => {
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    const subscriber = await buildUser({ teamId: document.teamId });

    document.collaboratorIds = [collaborator.id, subscriber.id];

    await document.save();

    await NotificationSetting.create({
      userId: collaborator.id,
      teamId: collaborator.teamId,
      event: "documents.update",
    });

    await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    expect(DocumentNotificationEmail.schedule).toHaveBeenCalled();
  });

  test("should create subscriptions for collaborator", async () => {
    const collaborator0 = await buildUser();
    const collaborator1 = await buildUser({ teamId: collaborator0.teamId });
    const collaborator2 = await buildUser({ teamId: collaborator0.teamId });
    const document = await buildDocument({ userId: collaborator0.id });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    await document.update({
      collaboratorIds: [collaborator0.id, collaborator1.id, collaborator2.id],
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator0.id,
      modelId: revision.id,
      ip,
    });

    const events = await Event.findAll();

    // Should emit 3 `subscriptions.create` events.
    expect(events.length).toEqual(3);
    expect(events[0].name).toEqual("subscriptions.create");
    expect(events[1].name).toEqual("subscriptions.create");
    expect(events[2].name).toEqual("subscriptions.create");

    // Each event should point to same document.
    expect(events[0].documentId).toEqual(document.id);
    expect(events[1].documentId).toEqual(document.id);
    expect(events[2].documentId).toEqual(document.id);

    // Events should mention correct `userId`.
    expect(events[0].userId).toEqual(collaborator0.id);
    expect(events[1].userId).toEqual(collaborator1.id);
    expect(events[2].userId).toEqual(collaborator2.id);
  });

  test("should not send multiple emails", async () => {
    const collaborator0 = await buildUser();
    const collaborator1 = await buildUser({ teamId: collaborator0.teamId });
    const collaborator2 = await buildUser({ teamId: collaborator0.teamId });
    const document = await buildDocument({
      teamId: collaborator0.teamId,
      userId: collaborator0.id,
    });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    await document.update({
      collaboratorIds: [collaborator0.id, collaborator1.id, collaborator2.id],
    });

    const processor = new NotificationsProcessor();

    // Changing document will emit a `documents.update` event.
    await processor.perform({
      name: "documents.update",
      documentId: document.id,
      collectionId: document.collectionId,
      createdAt: document.updatedAt.toString(),
      teamId: document.teamId,
      data: { title: document.title, autosave: false, done: true },
      actorId: collaborator2.id,
      ip,
    });

    // Those changes will also emit a `revisions.create` event.
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator0.id,
      modelId: revision.id,
      ip,
    });

    // This should send out 2 emails, one for each collaborator that did not
    // participate in the edit
    expect(DocumentNotificationEmail.schedule).toHaveBeenCalledTimes(2);
  });

  test("should not create subscriptions if previously unsubscribed", async () => {
    const collaborator0 = await buildUser();
    const collaborator1 = await buildUser({ teamId: collaborator0.teamId });
    const collaborator2 = await buildUser({ teamId: collaborator0.teamId });
    const document = await buildDocument({
      teamId: collaborator0.teamId,
      userId: collaborator0.id,
    });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    await document.update({
      collaboratorIds: [collaborator0.id, collaborator1.id, collaborator2.id],
    });

    // `collaborator2` created a subscription.
    const subscription2 = await Subscription.create({
      userId: collaborator2.id,
      documentId: document.id,
      event: "documents.update",
    });

    // `collaborator2` would no longer like to be notified.
    await subscription2.destroy();

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator0.id,
      modelId: revision.id,
      ip,
    });

    const events = await Event.findAll();

    // Should emit 2 `subscriptions.create` events.
    expect(events.length).toEqual(2);
    expect(events[0].name).toEqual("subscriptions.create");
    expect(events[1].name).toEqual("subscriptions.create");

    // Each event should point to same document.
    expect(events[0].documentId).toEqual(document.id);
    expect(events[1].documentId).toEqual(document.id);

    // Events should mention correct `userId`.
    expect(events[0].userId).toEqual(collaborator0.id);
    expect(events[1].userId).toEqual(collaborator1.id);

    // One notification as one collaborator performed edit and the other is
    // unsubscribed
    expect(DocumentNotificationEmail.schedule).toHaveBeenCalledTimes(1);
  });

  test("should send a notification for subscriptions to non-collaborators", async () => {
    const document = await buildDocument();
    const collaborator = await buildUser({ teamId: document.teamId });
    const subscriber = await buildUser({ teamId: document.teamId });
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);

    // `subscriber` hasn't collaborated on `document`.
    document.collaboratorIds = [collaborator.id];

    await document.save();

    await NotificationSetting.create({
      userId: collaborator.id,
      teamId: collaborator.teamId,
      event: "documents.update",
    });

    // `subscriber` subscribes to `document`'s changes.
    // Specifically "documents.update" event.
    await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    expect(DocumentNotificationEmail.schedule).toHaveBeenCalled();
  });

  test("should not send a notification for subscriptions to collaborators if unsubscribed", async () => {
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    const subscriber = await buildUser({ teamId: document.teamId });

    // `subscriber` has collaborated on `document`.
    document.collaboratorIds = [collaborator.id, subscriber.id];

    await document.save();

    await NotificationSetting.create({
      userId: collaborator.id,
      teamId: collaborator.teamId,
      event: "documents.update",
    });

    // `subscriber` subscribes to `document`'s changes.
    // Specifically "documents.update" event.
    const subscription = await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    subscription.destroy();

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    // Should send notification to `collaborator` and not `subscriber`.
    expect(DocumentNotificationEmail.schedule).toHaveBeenCalledTimes(1);
  });

  test("should not send a notification for subscriptions to members outside of the team", async () => {
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    document.text = "Updated body content";
    document.updatedAt = new Date();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });

    // `subscriber` *does not* belong
    // to `collaborator`'s team,
    const subscriber = await buildUser();

    // `subscriber` hasn't collaborated on `document`.
    document.collaboratorIds = [collaborator.id];

    await document.save();

    await NotificationSetting.create({
      userId: collaborator.id,
      teamId: collaborator.teamId,
      event: "documents.update",
    });

    // `subscriber` subscribes to `document`'s changes.
    // Specifically "documents.update" event.
    // Not sure how they got hold of this document,
    // but let's just pretend they did!
    await Subscription.create({
      userId: subscriber.id,
      documentId: document.id,
      event: "documents.update",
      enabled: true,
    });

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });

    // Should send notification to `collaborator` and not `subscriber`.
    expect(DocumentNotificationEmail.schedule).toHaveBeenCalledTimes(1);
  });

  test("should not send a notification if viewed since update", async () => {
    const document = await buildDocument();
    const revision = await Revision.createFromDocument(document);
    const collaborator = await buildUser({ teamId: document.teamId });
    document.collaboratorIds = [collaborator.id];
    await document.save();
    await NotificationSetting.create({
      userId: collaborator.id,
      teamId: collaborator.teamId,
      event: "documents.update",
    });
    await View.touch(document.id, collaborator.id, true);

    const processor = new NotificationsProcessor();

    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: collaborator.id,
      modelId: revision.id,
      ip,
    });
    expect(DocumentNotificationEmail.schedule).not.toHaveBeenCalled();
  });

  test("should not send a notification to last editor", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      lastModifiedById: user.id,
    });
    const revision = await Revision.createFromDocument(document);

    await NotificationSetting.create({
      userId: user.id,
      teamId: user.teamId,
      event: "documents.update",
    });
    const processor = new NotificationsProcessor();
    await processor.perform({
      name: "revisions.create",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: user.id,
      modelId: revision.id,
      ip,
    });
    expect(DocumentNotificationEmail.schedule).not.toHaveBeenCalled();
  });
});
