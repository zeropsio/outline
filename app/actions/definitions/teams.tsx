import { PlusIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import TeamNew from "~/scenes/TeamNew";
import { createAction } from "~/actions";
import { loadSessionsFromCookie } from "~/hooks/useSessions";
import { TeamSection } from "../sections";

export const switchTeamList = getSessions().map((session) => {
  return createAction({
    name: session.name,
    section: TeamSection,
    keywords: "change switch workspace organization team",
    icon: () => <Logo alt={session.name} src={session.logoUrl} />,
    visible: ({ currentTeamId }) => currentTeamId !== session.teamId,
    perform: () => (window.location.href = session.url),
  });
});

const switchTeam = createAction({
  name: ({ t }) => t("Switch workspace"),
  placeholder: ({ t }) => t("Select a workspace"),
  keywords: "change switch workspace organization team",
  section: TeamSection,
  visible: ({ currentTeamId }) =>
    getSessions({ exclude: currentTeamId }).length > 0,
  children: switchTeamList,
});

export const createTeam = createAction({
  name: ({ t }) => `${t("New workspace")}…`,
  keywords: "create change switch workspace organization team",
  section: TeamSection,
  icon: <PlusIcon />,
  visible: ({ stores, currentTeamId }) => {
    return stores.policies.abilities(currentTeamId ?? "").createTeam;
  },
  perform: ({ t, event, stores }) => {
    event?.preventDefault();
    event?.stopPropagation();
    const { user } = stores.auth;
    user &&
      stores.dialogs.openModal({
        title: t("Create a workspace"),
        content: <TeamNew user={user} />,
      });
  },
});

function getSessions(params?: { exclude?: string }) {
  const sessions = loadSessionsFromCookie();
  const otherSessions = sessions.filter(
    (session) => session.teamId !== params?.exclude
  );
  return otherSessions;
}

const Logo = styled("img")`
  border-radius: 2px;
  width: 24px;
  height: 24px;
`;

export const rootTeamActions = [switchTeam, createTeam];
