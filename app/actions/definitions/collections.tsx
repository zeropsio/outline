import {
  CollectionIcon,
  EditIcon,
  PadlockIcon,
  PlusIcon,
  StarredIcon,
  UnstarredIcon,
} from "outline-icons";
import * as React from "react";
import stores from "~/stores";
import Collection from "~/models/Collection";
import CollectionEdit from "~/scenes/CollectionEdit";
import CollectionNew from "~/scenes/CollectionNew";
import CollectionPermissions from "~/scenes/CollectionPermissions";
import DynamicCollectionIcon from "~/components/CollectionIcon";
import { createAction } from "~/actions";
import { CollectionSection } from "~/actions/sections";
import history from "~/utils/history";

const ColorCollectionIcon = ({ collection }: { collection: Collection }) => {
  return <DynamicCollectionIcon collection={collection} />;
};

export const openCollection = createAction({
  name: ({ t }) => t("Open collection"),
  section: CollectionSection,
  shortcut: ["o", "c"],
  icon: <CollectionIcon />,
  children: ({ stores }) => {
    const collections = stores.collections.orderedData;
    return collections.map((collection) => ({
      // Note: using url which includes the slug rather than id here to bust
      // cache if the collection is renamed
      id: collection.url,
      name: collection.name,
      icon: <ColorCollectionIcon collection={collection} />,
      section: CollectionSection,
      perform: () => history.push(collection.url),
    }));
  },
});

export const createCollection = createAction({
  name: ({ t }) => t("New collection"),
  section: CollectionSection,
  icon: <PlusIcon />,
  keywords: "create",
  visible: ({ stores }) =>
    stores.policies.abilities(stores.auth.team?.id || "").createCollection,
  perform: ({ t, event }) => {
    event?.preventDefault();
    event?.stopPropagation();
    stores.dialogs.openModal({
      title: t("Create a collection"),
      content: <CollectionNew onSubmit={stores.dialogs.closeAllModals} />,
    });
  },
});

export const editCollection = createAction({
  name: ({ t, isContextMenu }) =>
    isContextMenu ? `${t("Edit")}…` : t("Edit collection"),
  section: CollectionSection,
  icon: <EditIcon />,
  visible: ({ stores, activeCollectionId }) =>
    !!activeCollectionId &&
    stores.policies.abilities(activeCollectionId).update,
  perform: ({ t, activeCollectionId }) => {
    if (!activeCollectionId) {
      return;
    }

    stores.dialogs.openModal({
      title: t("Edit collection"),
      content: (
        <CollectionEdit
          onSubmit={stores.dialogs.closeAllModals}
          collectionId={activeCollectionId}
        />
      ),
    });
  },
});

export const editCollectionPermissions = createAction({
  name: ({ t, isContextMenu }) =>
    isContextMenu ? `${t("Permissions")}…` : t("Collection permissions"),
  section: CollectionSection,
  icon: <PadlockIcon />,
  visible: ({ stores, activeCollectionId }) =>
    !!activeCollectionId &&
    stores.policies.abilities(activeCollectionId).update,
  perform: ({ t, activeCollectionId }) => {
    if (!activeCollectionId) {
      return;
    }

    stores.dialogs.openModal({
      title: t("Collection permissions"),
      content: <CollectionPermissions collectionId={activeCollectionId} />,
    });
  },
});

export const starCollection = createAction({
  name: ({ t }) => t("Star"),
  section: CollectionSection,
  icon: <StarredIcon />,
  keywords: "favorite bookmark",
  visible: ({ activeCollectionId, stores }) => {
    if (!activeCollectionId) {
      return false;
    }
    const collection = stores.collections.get(activeCollectionId);
    return (
      !collection?.isStarred &&
      stores.policies.abilities(activeCollectionId).star
    );
  },
  perform: ({ activeCollectionId, stores }) => {
    if (!activeCollectionId) {
      return;
    }

    const collection = stores.collections.get(activeCollectionId);
    collection?.star();
  },
});

export const unstarCollection = createAction({
  name: ({ t }) => t("Unstar"),
  section: CollectionSection,
  icon: <UnstarredIcon />,
  keywords: "unfavorite unbookmark",
  visible: ({ activeCollectionId, stores }) => {
    if (!activeCollectionId) {
      return false;
    }
    const collection = stores.collections.get(activeCollectionId);
    return (
      !!collection?.isStarred &&
      stores.policies.abilities(activeCollectionId).unstar
    );
  },
  perform: ({ activeCollectionId, stores }) => {
    if (!activeCollectionId) {
      return;
    }

    const collection = stores.collections.get(activeCollectionId);
    collection?.unstar();
  },
});

export const rootCollectionActions = [
  openCollection,
  createCollection,
  starCollection,
  unstarCollection,
];
