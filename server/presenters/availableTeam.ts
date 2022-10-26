import { Team } from "@server/models";

export default function present(team: Team, isSignedIn = false) {
  return {
    id: team.id,
    name: team.name,
    avatarUrl: team.logoUrl,
    url: team.url,
    isSignedIn,
  };
}
