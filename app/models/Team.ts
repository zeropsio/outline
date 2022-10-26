import { computed, observable } from "mobx";
import { TeamPreference, TeamPreferences } from "@shared/types";
import BaseModel from "./BaseModel";
import Field from "./decorators/Field";

class Team extends BaseModel {
  @Field
  @observable
  id: string;

  @Field
  @observable
  name: string;

  @Field
  @observable
  avatarUrl: string;

  @Field
  @observable
  sharing: boolean;

  @Field
  @observable
  inviteRequired: boolean;

  @Field
  @observable
  collaborativeEditing: boolean;

  @Field
  @observable
  documentEmbeds: boolean;

  @Field
  @observable
  defaultCollectionId: string | null;

  @Field
  @observable
  memberCollectionCreate: boolean;

  @Field
  @observable
  guestSignin: boolean;

  @Field
  @observable
  subdomain: string | null | undefined;

  @Field
  @observable
  defaultUserRole: string;

  @Field
  @observable
  preferences: TeamPreferences | null;

  domain: string | null | undefined;

  url: string;

  @Field
  @observable
  allowedDomains: string[] | null | undefined;

  @computed
  get signinMethods(): string {
    return "SSO";
  }

  /**
   * Returns whether this team is using a separate editing mode behind an "Edit"
   * button rather than seamless always-editing.
   *
   * @returns True if editing mode is seamless (no button)
   */
  @computed
  get seamlessEditing(): boolean {
    return (
      this.collaborativeEditing &&
      this.getPreference(TeamPreference.SeamlessEdit, true)
    );
  }

  /**
   * Get the value for a specific preference key, or return the fallback if
   * none is set.
   *
   * @param key The TeamPreference key to retrieve
   * @param fallback An optional fallback value, defaults to false.
   * @returns The value
   */
  getPreference(key: TeamPreference, fallback = false): boolean {
    return this.preferences?.[key] ?? fallback;
  }

  /**
   * Set the value for a specific preference key.
   *
   * @param key The TeamPreference key to retrieve
   * @param value The value to set
   */
  setPreference(key: TeamPreference, value: boolean) {
    this.preferences = {
      ...this.preferences,
      [key]: value,
    };
  }
}

export default Team;
