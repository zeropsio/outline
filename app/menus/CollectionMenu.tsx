import { observer } from "mobx-react";
import {
  NewDocumentIcon,
  TrashIcon,
  ImportIcon,
  ExportIcon,
  AlphabeticalSortIcon,
  ManualSortIcon,
  UnstarredIcon,
  StarredIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { useMenuState, MenuButton, MenuButtonHTMLProps } from "reakit/Menu";
import { VisuallyHidden } from "reakit/VisuallyHidden";
import { getEventFiles } from "@shared/utils/files";
import Collection from "~/models/Collection";
import CollectionExport from "~/scenes/CollectionExport";
import CollectionDeleteDialog from "~/components/CollectionDeleteDialog";
import ContextMenu, { Placement } from "~/components/ContextMenu";
import OverflowMenuButton from "~/components/ContextMenu/OverflowMenuButton";
import Template from "~/components/ContextMenu/Template";
import { actionToMenuItem } from "~/actions";
import {
  editCollection,
  editCollectionPermissions,
} from "~/actions/definitions/collections";
import useActionContext from "~/hooks/useActionContext";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import useToasts from "~/hooks/useToasts";
import { MenuItem } from "~/types";
import { newDocumentPath } from "~/utils/routeHelpers";

type Props = {
  collection: Collection;
  placement?: Placement;
  modal?: boolean;
  label?: (props: MenuButtonHTMLProps) => React.ReactNode;
  onOpen?: () => void;
  onClose?: () => void;
};

function CollectionMenu({
  collection,
  label,
  modal = true,
  placement,
  onOpen,
  onClose,
}: Props) {
  const menu = useMenuState({
    modal,
    placement,
  });
  const team = useCurrentTeam();
  const { documents, dialogs } = useStores();
  const { showToast } = useToasts();
  const { t } = useTranslation();
  const history = useHistory();
  const file = React.useRef<HTMLInputElement>(null);

  const handleExport = React.useCallback(() => {
    dialogs.openModal({
      title: t("Export collection"),
      isCentered: true,
      content: (
        <CollectionExport
          collection={collection}
          onSubmit={dialogs.closeAllModals}
        />
      ),
    });
  }, [collection, dialogs, t]);

  const handleNewDocument = React.useCallback(
    (ev: React.SyntheticEvent) => {
      ev.preventDefault();
      history.push(newDocumentPath(collection.id));
    },
    [history, collection.id]
  );

  const stopPropagation = React.useCallback((ev: React.SyntheticEvent) => {
    ev.stopPropagation();
  }, []);

  const handleImportDocument = React.useCallback(
    (ev: React.SyntheticEvent) => {
      ev.preventDefault();
      ev.stopPropagation();

      // simulate a click on the file upload input element
      if (file.current) {
        file.current.click();
      }
    },
    [file]
  );

  const handleFilePicked = React.useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const files = getEventFiles(ev);

      // Because this is the onChange handler it's possible for the change to be
      // from previously selecting a file to not selecting a file – aka empty
      if (!files.length) {
        return;
      }

      try {
        const file = files[0];
        const document = await documents.import(file, null, collection.id, {
          publish: true,
        });
        history.push(document.url);
      } catch (err) {
        showToast(err.message, {
          type: "error",
        });
        throw err;
      }
    },
    [history, showToast, collection.id, documents]
  );

  const handleChangeSort = React.useCallback(
    (field: string) => {
      menu.hide();
      return collection.save({
        sort: {
          field,
          direction: "asc",
        },
      });
    },
    [collection, menu]
  );

  const handleDelete = React.useCallback(() => {
    dialogs.openModal({
      isCentered: true,
      title: t("Delete collection"),
      content: (
        <CollectionDeleteDialog
          collection={collection}
          onSubmit={dialogs.closeAllModals}
        />
      ),
    });
  }, [dialogs, t, collection]);

  const handleStar = React.useCallback(
    (ev: React.SyntheticEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      collection.star();
    },
    [collection]
  );

  const handleUnstar = React.useCallback(
    (ev: React.SyntheticEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      collection.unstar();
    },
    [collection]
  );

  const context = useActionContext({
    isContextMenu: true,
    activeCollectionId: collection.id,
  });

  const alphabeticalSort = collection.sort.field === "title";
  const can = usePolicy(collection);
  const canUserInTeam = usePolicy(team);
  const items: MenuItem[] = React.useMemo(
    () => [
      {
        type: "button",
        title: t("Unstar"),
        onClick: handleUnstar,
        visible: collection.isStarred && !!can.unstar,
        icon: <UnstarredIcon />,
      },
      {
        type: "button",
        title: t("Star"),
        onClick: handleStar,
        visible: !collection.isStarred && !!can.star,
        icon: <StarredIcon />,
      },
      {
        type: "separator",
      },
      {
        type: "button",
        title: t("New document"),
        visible: can.update,
        onClick: handleNewDocument,
        icon: <NewDocumentIcon />,
      },
      {
        type: "button",
        title: t("Import document"),
        visible: can.update,
        onClick: handleImportDocument,
        icon: <ImportIcon />,
      },
      {
        type: "separator",
      },
      actionToMenuItem(editCollection, context),
      actionToMenuItem(editCollectionPermissions, context),
      {
        type: "submenu",
        title: t("Sort in sidebar"),
        visible: can.update,
        icon: alphabeticalSort ? (
          <AlphabeticalSortIcon color="currentColor" />
        ) : (
          <ManualSortIcon color="currentColor" />
        ),
        items: [
          {
            type: "button",
            title: t("Alphabetical sort"),
            onClick: () => handleChangeSort("title"),
            selected: alphabeticalSort,
          },
          {
            type: "button",
            title: t("Manual sort"),
            onClick: () => handleChangeSort("index"),
            selected: !alphabeticalSort,
          },
        ],
      },
      {
        type: "button",
        title: `${t("Export")}…`,
        visible: !!(collection && canUserInTeam.createExport),
        onClick: handleExport,
        icon: <ExportIcon />,
      },
      {
        type: "separator",
      },
      {
        type: "button",
        title: `${t("Delete")}…`,
        dangerous: true,
        visible: !!(collection && can.delete),
        onClick: handleDelete,
        icon: <TrashIcon />,
      },
    ],
    [
      t,
      handleUnstar,
      collection,
      can.unstar,
      can.star,
      can.update,
      can.delete,
      handleStar,
      handleNewDocument,
      handleImportDocument,
      context,
      alphabeticalSort,
      canUserInTeam.createExport,
      handleExport,
      handleDelete,
      handleChangeSort,
    ]
  );

  if (!items.length) {
    return null;
  }

  return (
    <>
      <VisuallyHidden>
        <label>
          {t("Import document")}
          <input
            type="file"
            ref={file}
            onChange={handleFilePicked}
            onClick={stopPropagation}
            accept={documents.importFileTypes.join(", ")}
            tabIndex={-1}
          />
        </label>
      </VisuallyHidden>
      {label ? (
        <MenuButton {...menu}>{label}</MenuButton>
      ) : (
        <OverflowMenuButton aria-label={t("Show menu")} {...menu} />
      )}
      <ContextMenu
        {...menu}
        onOpen={onOpen}
        onClose={onClose}
        aria-label={t("Collection")}
      >
        <Template {...menu} items={items} />
      </ContextMenu>
    </>
  );
}

export default observer(CollectionMenu);
