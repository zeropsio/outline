import * as React from "react";

const MultiplayerEditor = React.lazy(
  () =>
    import(
      /* webpackChunkName: "preload-multiplayer-editor" */
      "./MultiplayerEditor"
    )
);

export default MultiplayerEditor;
