import * as React from "react";
import BaseEmail from "./BaseEmail";
import Body from "./components/Body";
import Button from "./components/Button";
import EmailTemplate from "./components/EmailLayout";
import EmptySpace from "./components/EmptySpace";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Heading from "./components/Heading";

type Props = {
  to: string;
  name: string;
  actorName: string;
  actorEmail: string;
  teamName: string;
  teamUrl: string;
};

/**
 * Email sent to an external user when an admin sends them an invite and they
 * haven't signed in after a few days.
 */
export default class InviteReminderEmail extends BaseEmail<Props> {
  protected subject({ actorName, teamName }: Props) {
    return `Reminder: ${actorName} invited you to join ${teamName}’s knowledge base`;
  }

  protected preview() {
    return "Outline is a place for your team to build and share knowledge.";
  }

  protected renderAsText({
    teamName,
    actorName,
    actorEmail,
    teamUrl,
  }: Props): string {
    return `
This is just a quick reminder that ${actorName} (${actorEmail}) invited you to join them in the ${teamName} team on Outline, a place for your team to build and share knowledge.
We only send a reminder once.

If you haven't signed up yet, you can do so here: ${teamUrl}
`;
  }

  protected render({ teamName, actorName, actorEmail, teamUrl }: Props) {
    return (
      <EmailTemplate>
        <Header />

        <Body>
          <Heading>Join {teamName} on Outline</Heading>
          <p>
            This is just a quick reminder that {actorName} ({actorEmail})
            invited you to join them in the {teamName} team on Outline, a place
            for your team to build and share knowledge.
          </p>
          <p>If you haven't signed up yet, you can do so here:</p>
          <EmptySpace height={10} />
          <p>
            <Button href={`${teamUrl}?ref=invite-reminder-email`}>
              Join now
            </Button>
          </p>
        </Body>

        <Footer />
      </EmailTemplate>
    );
  }
}
