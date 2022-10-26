import { subMinutes } from "date-fns";
import { computed, observable } from "mobx";
import { now } from "mobx-utils";
import type { Role, UserPreference, UserPreferences } from "@shared/types";
import ParanoidModel from "./ParanoidModel";
import Field from "./decorators/Field";

class User extends ParanoidModel {
  @Field
  @observable
  id: string;

  @Field
  @observable
  avatarUrl: string;

  @Field
  @observable
  name: string;

  @Field
  @observable
  color: string;

  @Field
  @observable
  language: string;

  @Field
  @observable
  preferences: UserPreferences | null;

  email: string;

  isAdmin: boolean;

  isViewer: boolean;

  lastActiveAt: string;

  isSuspended: boolean;

  @computed
  get isInvited(): boolean {
    return !this.lastActiveAt;
  }

  /**
   * Whether the user has been recently active. Recently is currently defined
   * as within the last 5 minutes.
   *
   * @returns true if the user has been active recently
   */
  @computed
  get isRecentlyActive(): boolean {
    return new Date(this.lastActiveAt) > subMinutes(now(10000), 5);
  }

  @computed
  get role(): Role {
    if (this.isAdmin) {
      return "admin";
    } else if (this.isViewer) {
      return "viewer";
    } else {
      return "member";
    }
  }

  /**
   * Get the value for a specific preference key, or return the fallback if
   * none is set.
   *
   * @param key The UserPreference key to retrieve
   * @param fallback An optional fallback value, defaults to false.
   * @returns The value
   */
  getPreference(key: UserPreference, fallback = false): boolean {
    return this.preferences?.[key] ?? fallback;
  }

  /**
   * Set the value for a specific preference key.
   *
   * @param key The UserPreference key to retrieve
   * @param value The value to set
   */
  setPreference(key: UserPreference, value: boolean) {
    this.preferences = {
      ...this.preferences,
      [key]: value,
    };
  }
}

export default User;
