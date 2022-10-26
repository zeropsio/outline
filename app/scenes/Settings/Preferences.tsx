import { observer } from "mobx-react";
import { SettingsIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { languageOptions } from "@shared/i18n";
import { UserPreference } from "@shared/types";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import InputSelect from "~/components/InputSelect";
import Scene from "~/components/Scene";
import Switch from "~/components/Switch";
import Text from "~/components/Text";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import useToasts from "~/hooks/useToasts";
import UserDelete from "../UserDelete";
import SettingRow from "./components/SettingRow";

function Preferences() {
  const { t } = useTranslation();
  const { showToast } = useToasts();
  const { dialogs, auth } = useStores();
  const user = useCurrentUser();

  const handlePreferenceChange = async (
    ev: React.ChangeEvent<HTMLInputElement>
  ) => {
    const preferences = {
      ...user.preferences,
      [ev.target.name]: ev.target.checked,
    };

    await auth.updateUser({ preferences });
    showToast(t("Preferences saved"), {
      type: "success",
    });
  };

  const handleLanguageChange = async (language: string) => {
    await auth.updateUser({ language });
    showToast(t("Preferences saved"), {
      type: "success",
    });
  };

  const showDeleteAccount = () => {
    dialogs.openModal({
      title: t("Delete account"),
      content: <UserDelete />,
    });
  };

  return (
    <Scene
      title={t("Preferences")}
      icon={<SettingsIcon color="currentColor" />}
    >
      <Heading>{t("Preferences")}</Heading>
      <Text type="secondary">
        <Trans>Manage settings that affect your personal experience.</Trans>
      </Text>

      <Heading as="h2">{t("Display")}</Heading>
      <SettingRow
        label={t("Language")}
        name="language"
        description={
          <>
            <Trans>
              Choose the interface language. Community translations are accepted
              though our{" "}
              <a
                href="https://translate.getoutline.com"
                target="_blank"
                rel="noreferrer"
              >
                translation portal
              </a>
              .
            </Trans>
          </>
        }
      >
        <InputSelect
          id="language"
          options={languageOptions}
          value={user.language}
          onChange={handleLanguageChange}
          ariaLabel={t("Language")}
        />
      </SettingRow>
      <SettingRow
        name="useCursorPointer"
        label={t("Use pointer cursor")}
        description={t(
          "Show a hand cursor when hovering over interactive elements."
        )}
      >
        <Switch
          id="useCursorPointer"
          name="useCursorPointer"
          checked={user.getPreference(UserPreference.UseCursorPointer, true)}
          onChange={handlePreferenceChange}
        />
      </SettingRow>
      <SettingRow
        name="codeBlockLineNumbers"
        label={t("Show line numbers")}
        description={t("Show line numbers on code blocks in documents.")}
        border={false}
      >
        <Switch
          id="codeBlockLineNumbers"
          name="codeBlockLineNumbers"
          checked={user.getPreference(UserPreference.CodeBlockLineNumers, true)}
          onChange={handlePreferenceChange}
        />
      </SettingRow>

      <Heading as="h2">{t("Behavior")}</Heading>
      <SettingRow
        border={false}
        name="rememberLastPath"
        label={t("Remember previous location")}
        description={t(
          "Automatically return to the document you were last viewing when the app is re-opened."
        )}
      >
        <Switch
          id="rememberLastPath"
          name="rememberLastPath"
          checked={!!user.preferences?.rememberLastPath}
          onChange={handlePreferenceChange}
        />
      </SettingRow>

      <p>&nbsp;</p>

      <SettingRow
        name="delete"
        label={t("Delete account")}
        description={t(
          "You may delete your account at any time, note that this is unrecoverable"
        )}
      >
        <span>
          <Button onClick={showDeleteAccount} neutral>
            {t("Delete account")}…
          </Button>
        </span>
      </SettingRow>
    </Scene>
  );
}

export default observer(Preferences);
