import env from "@server/env";
import { Team, User } from "@server/models";
import { allow } from "./cancan";

allow(User, "read", Team, (user, team) => user.teamId === team?.id);

allow(User, "share", Team, (user, team) => {
  if (!team || user.isViewer || user.teamId !== team.id) {
    return false;
  }
  return team.sharing;
});

allow(User, "createTeam", Team, () => {
  if (env.DEPLOYMENT !== "hosted") {
    throw new Error("createTeam only available on cloud");
  }
});

allow(User, ["update", "manage"], Team, (user, team) => {
  if (!team || user.isViewer || user.teamId !== team.id) {
    return false;
  }
  return user.isAdmin;
});
