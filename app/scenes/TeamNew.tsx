import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import User from "~/models/User";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Input from "~/components/Input";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import useToasts from "~/hooks/useToasts";

type Props = {
  user: User;
};

function TeamNew({ user }: Props) {
  const { auth } = useStores();
  const { t } = useTranslation();
  const { showToast } = useToasts();
  const [name, setName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSubmit = async (ev: React.SyntheticEvent) => {
    ev.preventDefault();
    setIsSaving(true);

    try {
      if (name.trim().length > 1) {
        await auth.createTeam({
          name: name.trim(),
        });
      }
    } catch (err) {
      showToast(err.message, {
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNameChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    setName(ev.target.value);
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <Text type="secondary">
          <Trans
            defaults="Your are creating a new workspace using your current account — <em>{{email}}</em>"
            values={{
              email: user.email,
            }}
            components={{
              em: <strong />,
            }}
          />
        </Text>

        <Flex>
          <Input
            type="text"
            label={t("Workspace name")}
            onChange={handleNameChange}
            value={name}
            required
            autoFocus
            flex
          />
        </Flex>
        <Text type="secondary">
          <Trans>
            When your new workspace is created, you will be the admin, meaning
            you will have the highest level of permissions and the ability to
            invite others.
          </Trans>
        </Text>

        <Button type="submit" disabled={isSaving || !(name.trim().length > 1)}>
          {isSaving ? `${t("Creating")}…` : t("Create")}
        </Button>
      </form>
    </>
  );
}

export default observer(TeamNew);
