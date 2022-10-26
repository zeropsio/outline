import { observer } from "mobx-react";
import * as React from "react";
import EditorContainer from "@shared/editor/components/Styles";
import Document from "~/models/Document";
import Revision from "~/models/Revision";
import DocumentMetaWithViews from "~/components/DocumentMetaWithViews";
import { Props as EditorProps } from "~/components/Editor";
import Flex from "~/components/Flex";
import { documentUrl } from "~/utils/routeHelpers";

type Props = Omit<EditorProps, "extensions"> & {
  id: string;
  document: Document;
  revision: Revision;
  isDraft: boolean;
  children?: React.ReactNode;
};

/**
 * Displays revision HTML pre-rendered on the server.
 */
function RevisionViewer(props: Props) {
  const { document, isDraft, shareId, children, revision } = props;

  return (
    <Flex auto column>
      <h1 dir={revision.dir}>{revision.title}</h1>
      {!shareId && (
        <DocumentMetaWithViews
          isDraft={isDraft}
          document={document}
          to={documentUrl(document)}
          rtl={revision.rtl}
        />
      )}
      <EditorContainer
        dangerouslySetInnerHTML={{ __html: revision.html }}
        dir={revision.dir}
        rtl={revision.rtl}
      />
      {children}
    </Flex>
  );
}

export default observer(RevisionViewer);
