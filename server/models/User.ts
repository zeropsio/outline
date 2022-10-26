import crypto from "crypto";
import { addMinutes, subMinutes } from "date-fns";
import JWT from "jsonwebtoken";
import { Context } from "koa";
import { Transaction, QueryTypes, SaveOptions, Op } from "sequelize";
import {
  Table,
  Column,
  IsIP,
  IsEmail,
  Default,
  IsIn,
  BeforeDestroy,
  BeforeCreate,
  AfterCreate,
  BelongsTo,
  ForeignKey,
  DataType,
  HasMany,
  Scopes,
  IsDate,
  IsUrl,
  AllowNull,
} from "sequelize-typescript";
import { languages } from "@shared/i18n";
import {
  CollectionPermission,
  UserPreference,
  UserPreferences,
} from "@shared/types";
import { stringToColor } from "@shared/utils/color";
import env from "@server/env";
import { ValidationError } from "../errors";
import ApiKey from "./ApiKey";
import Collection from "./Collection";
import CollectionUser from "./CollectionUser";
import NotificationSetting from "./NotificationSetting";
import Star from "./Star";
import Team from "./Team";
import UserAuthentication from "./UserAuthentication";
import ParanoidModel from "./base/ParanoidModel";
import Encrypted, {
  setEncryptedColumn,
  getEncryptedColumn,
} from "./decorators/Encrypted";
import Fix from "./decorators/Fix";
import Length from "./validators/Length";
import NotContainsUrl from "./validators/NotContainsUrl";

/**
 * Flags that are available for setting on the user.
 */
export enum UserFlag {
  InviteSent = "inviteSent",
  InviteReminderSent = "inviteReminderSent",
  DesktopWeb = "desktopWeb",
  MobileWeb = "mobileWeb",
}

export enum UserRole {
  Member = "member",
  Viewer = "viewer",
}

@Scopes(() => ({
  withAuthentications: {
    include: [
      {
        model: UserAuthentication,
        as: "authentications",
      },
    ],
  },
  withTeam: {
    include: [
      {
        model: Team,
        as: "team",
        required: true,
      },
    ],
  },
  withInvitedBy: {
    include: [
      {
        model: User,
        as: "invitedBy",
        required: true,
      },
    ],
  },
  invited: {
    where: {
      lastActiveAt: {
        [Op.is]: null,
      },
    },
  },
}))
@Table({ tableName: "users", modelName: "user" })
@Fix
class User extends ParanoidModel {
  @IsEmail
  @Length({ max: 255, msg: "User email must be 255 characters or less" })
  @Column
  email: string | null;

  @NotContainsUrl
  @Length({ max: 255, msg: "User username must be 255 characters or less" })
  @Column
  username: string | null;

  @NotContainsUrl
  @Length({ max: 255, msg: "User name must be 255 characters or less" })
  @Column
  name: string;

  @Default(false)
  @Column
  isAdmin: boolean;

  @Default(false)
  @Column
  isViewer: boolean;

  @Column(DataType.BLOB)
  @Encrypted
  get jwtSecret() {
    return getEncryptedColumn(this, "jwtSecret");
  }

  set jwtSecret(value: string) {
    setEncryptedColumn(this, "jwtSecret", value);
  }

  @IsDate
  @Column
  lastActiveAt: Date | null;

  @IsIP
  @Column
  lastActiveIp: string | null;

  @IsDate
  @Column
  lastSignedInAt: Date | null;

  @IsIP
  @Column
  lastSignedInIp: string | null;

  @IsDate
  @Column
  lastSigninEmailSentAt: Date | null;

  @IsDate
  @Column
  suspendedAt: Date | null;

  @Column(DataType.JSONB)
  flags: { [key in UserFlag]?: number } | null;

  @AllowNull
  @Column(DataType.JSONB)
  preferences: UserPreferences | null;

  @Default(env.DEFAULT_LANGUAGE)
  @IsIn([languages])
  @Column
  language: string;

  @AllowNull
  @IsUrl
  @Length({ max: 4096, msg: "avatarUrl must be less than 4096 characters" })
  @Column(DataType.STRING)
  get avatarUrl() {
    const original = this.getDataValue("avatarUrl");

    if (original) {
      return original;
    }

    const color = this.color.replace(/^#/, "");
    const initial = this.name ? this.name[0] : "?";
    const hash = crypto
      .createHash("md5")
      .update(this.email || "")
      .digest("hex");
    return `${env.DEFAULT_AVATAR_HOST}/avatar/${hash}/${initial}.png?c=${color}`;
  }

  set avatarUrl(value: string | null) {
    this.setDataValue("avatarUrl", value);
  }

  // associations
  @BelongsTo(() => User, "suspendedById")
  suspendedBy: User | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  suspendedById: string | null;

  @BelongsTo(() => User, "invitedById")
  invitedBy: User | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  invitedById: string | null;

  @BelongsTo(() => Team)
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @HasMany(() => UserAuthentication)
  authentications: UserAuthentication[];

  // getters

  get isSuspended(): boolean {
    return !!this.suspendedAt;
  }

  get isInvited() {
    return !this.lastActiveAt;
  }

  get color() {
    return stringToColor(this.id);
  }

  get defaultCollectionPermission(): CollectionPermission {
    return this.isViewer
      ? CollectionPermission.Read
      : CollectionPermission.ReadWrite;
  }

  /**
   * Returns a code that can be used to delete this user account. The code will
   * be rotated when the user signs out.
   *
   * @returns The deletion code.
   */
  get deleteConfirmationCode() {
    return crypto
      .createHash("md5")
      .update(this.jwtSecret)
      .digest("hex")
      .replace(/[l1IoO0]/gi, "")
      .slice(0, 8)
      .toUpperCase();
  }

  // instance methods

  /**
   * User flags are for storing information on a user record that is not visible
   * to the user itself.
   *
   * @param flag The flag to set
   * @param value Set the flag to true/false
   * @returns The current user flags
   */
  public setFlag = (flag: UserFlag, value = true) => {
    if (!this.flags) {
      this.flags = {};
    }
    const binary = value ? 1 : 0;
    if (this.flags[flag] !== binary) {
      this.flags[flag] = binary;
      this.changed("flags", true);
    }

    return this.flags;
  };

  /**
   * Returns the content of the given user flag.
   *
   * @param flag The flag to retrieve
   * @returns The flag value
   */
  public getFlag = (flag: UserFlag) => {
    return this.flags?.[flag] ?? 0;
  };

  /**
   * User flags are for storing information on a user record that is not visible
   * to the user itself.
   *
   * @param flag The flag to set
   * @param value The amount to increment by, defaults to 1
   * @returns The current user flags
   */
  public incrementFlag = (flag: UserFlag, value = 1) => {
    if (!this.flags) {
      this.flags = {};
    }
    this.flags[flag] = (this.flags[flag] ?? 0) + value;
    this.changed("flags", true);

    return this.flags;
  };

  /**
   * Preferences set by the user that decide application behavior and ui.
   *
   * @param preference The user preference to set
   * @param value Sets the preference value
   * @returns The current user preferences
   */
  public setPreference = (preference: UserPreference, value: boolean) => {
    if (!this.preferences) {
      this.preferences = {};
    }
    this.preferences[preference] = value;
    this.changed("preferences", true);

    return this.preferences;
  };

  /**
   * Returns the passed preference value
   *
   * @param preference The user preference to retrieve
   * @returns The preference value if set, else undefined
   */
  public getPreference = (preference: UserPreference) => {
    return !!this.preferences && this.preferences[preference]
      ? this.preferences[preference]
      : undefined;
  };

  collectionIds = async (options = {}) => {
    const collectionStubs = await Collection.scope({
      method: ["withMembership", this.id],
    }).findAll({
      attributes: ["id", "permission"],
      where: {
        teamId: this.teamId,
      },
      paranoid: true,
      ...options,
    });

    return collectionStubs
      .filter(
        (c) =>
          c.permission === CollectionPermission.Read ||
          c.permission === CollectionPermission.ReadWrite ||
          c.memberships.length > 0 ||
          c.collectionGroupMemberships.length > 0
      )
      .map((c) => c.id);
  };

  updateActiveAt = async (ctx: Context, force = false) => {
    const { ip } = ctx.request;
    const fiveMinutesAgo = subMinutes(new Date(), 5);

    // ensure this is updated only every few minutes otherwise
    // we'll be constantly writing to the DB as API requests happen
    if (!this.lastActiveAt || this.lastActiveAt < fiveMinutesAgo || force) {
      this.lastActiveAt = new Date();
      this.lastActiveIp = ip;
    }

    // Track the clients each user is using
    if (ctx.userAgent?.isMobile) {
      this.setFlag(UserFlag.MobileWeb);
    }
    if (ctx.userAgent?.isDesktop) {
      this.setFlag(UserFlag.DesktopWeb);
    }

    // Save only writes to the database if there are changes
    return this.save({
      hooks: false,
    });
  };

  updateSignedIn = (ip: string) => {
    const now = new Date();
    this.lastActiveAt = now;
    this.lastActiveIp = ip;
    this.lastSignedInAt = now;
    this.lastSignedInIp = ip;
    return this.save({ hooks: false });
  };

  /**
   * Rotate's the users JWT secret. This has the effect of invalidating ALL
   * previously issued tokens.
   *
   * @param options Save options
   * @returns Promise that resolves when database persisted
   */
  rotateJwtSecret = (options: SaveOptions) => {
    User.setRandomJwtSecret(this);
    return this.save(options);
  };

  /**
   * Returns a session token that is used to make API requests and is stored
   * in the client browser cookies to remain logged in.
   *
   * @param expiresAt The time the token will expire at
   * @returns The session token
   */
  getJwtToken = (expiresAt?: Date) => {
    return JWT.sign(
      {
        id: this.id,
        expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
        type: "session",
      },
      this.jwtSecret
    );
  };

  /**
   * Returns a temporary token that is only used for transferring a session
   * between subdomains or domains. It has a short expiry and can only be used
   * once.
   *
   * @returns The transfer token
   */
  getTransferToken = () => {
    return JWT.sign(
      {
        id: this.id,
        createdAt: new Date().toISOString(),
        expiresAt: addMinutes(new Date(), 1).toISOString(),
        type: "transfer",
      },
      this.jwtSecret
    );
  };

  /**
   * Returns a temporary token that is only used for logging in from an email
   * It can only be used to sign in once and has a medium length expiry
   *
   * @returns The email signin token
   */
  getEmailSigninToken = () => {
    return JWT.sign(
      {
        id: this.id,
        createdAt: new Date().toISOString(),
        type: "email-signin",
      },
      this.jwtSecret
    );
  };

  /**
   * Returns a list of teams that have a user matching this user's email.
   *
   * @returns A promise resolving to a list of teams
   */
  availableTeams = async () => {
    return Team.findAll({
      include: [
        {
          model: this.constructor as typeof User,
          required: true,
          where: { email: this.email },
        },
      ],
    });
  };

  demote = async (to: UserRole, options?: SaveOptions<User>) => {
    const res = await (this.constructor as typeof User).findAndCountAll({
      where: {
        teamId: this.teamId,
        isAdmin: true,
        id: {
          [Op.ne]: this.id,
        },
      },
      limit: 1,
    });

    if (res.count >= 1) {
      if (to === "member") {
        await this.update(
          {
            isAdmin: false,
            isViewer: false,
          },
          options
        );
      } else if (to === "viewer") {
        await this.update(
          {
            isAdmin: false,
            isViewer: true,
          },
          options
        );
        await CollectionUser.update(
          {
            permission: CollectionPermission.Read,
          },
          {
            ...options,
            where: {
              userId: this.id,
            },
          }
        );
      }

      return undefined;
    } else {
      throw ValidationError("At least one admin is required");
    }
  };

  promote = () => {
    return this.update({
      isAdmin: true,
      isViewer: false,
    });
  };

  // hooks

  @BeforeDestroy
  static removeIdentifyingInfo = async (
    model: User,
    options: { transaction: Transaction }
  ) => {
    await NotificationSetting.destroy({
      where: {
        userId: model.id,
      },
      transaction: options.transaction,
    });
    await ApiKey.destroy({
      where: {
        userId: model.id,
      },
      transaction: options.transaction,
    });
    await Star.destroy({
      where: {
        userId: model.id,
      },
      transaction: options.transaction,
    });
    await UserAuthentication.destroy({
      where: {
        userId: model.id,
      },
      transaction: options.transaction,
    });
    model.email = null;
    model.name = "Unknown";
    model.avatarUrl = null;
    model.username = null;
    model.lastActiveIp = null;
    model.lastSignedInIp = null;

    // this shouldn't be needed once this issue is resolved:
    // https://github.com/sequelize/sequelize/issues/9318
    await model.save({
      hooks: false,
      transaction: options.transaction,
    });
  };

  @BeforeCreate
  static setRandomJwtSecret = (model: User) => {
    model.jwtSecret = crypto.randomBytes(64).toString("hex");
  };

  // By default when a user signs up we subscribe them to email notifications
  // when documents they created are edited by other team members and onboarding.
  // If the user is an admin, they will also be subscribed to export_completed
  // notifications.
  @AfterCreate
  static subscribeToNotifications = async (
    model: User,
    options: { transaction: Transaction }
  ) => {
    await Promise.all([
      NotificationSetting.findOrCreate({
        where: {
          userId: model.id,
          teamId: model.teamId,
          event: "documents.update",
        },
        transaction: options.transaction,
      }),
      NotificationSetting.findOrCreate({
        where: {
          userId: model.id,
          teamId: model.teamId,
          event: "emails.onboarding",
        },
        transaction: options.transaction,
      }),
      NotificationSetting.findOrCreate({
        where: {
          userId: model.id,
          teamId: model.teamId,
          event: "emails.features",
        },
        transaction: options.transaction,
      }),
      NotificationSetting.findOrCreate({
        where: {
          userId: model.id,
          teamId: model.teamId,
          event: "emails.invite_accepted",
        },
        transaction: options.transaction,
      }),
    ]);

    if (model.isAdmin) {
      await NotificationSetting.findOrCreate({
        where: {
          userId: model.id,
          teamId: model.teamId,
          event: "emails.export_completed",
        },
        transaction: options.transaction,
      });
    }
  };

  static getCounts = async function (teamId: string) {
    const countSql = `
      SELECT
        COUNT(CASE WHEN "suspendedAt" IS NOT NULL THEN 1 END) as "suspendedCount",
        COUNT(CASE WHEN "isAdmin" = true THEN 1 END) as "adminCount",
        COUNT(CASE WHEN "isViewer" = true THEN 1 END) as "viewerCount",
        COUNT(CASE WHEN "lastActiveAt" IS NULL THEN 1 END) as "invitedCount",
        COUNT(CASE WHEN "suspendedAt" IS NULL AND "lastActiveAt" IS NOT NULL THEN 1 END) as "activeCount",
        COUNT(*) as count
      FROM users
      WHERE "deletedAt" IS NULL
      AND "teamId" = :teamId
    `;
    const [results] = await this.sequelize.query(countSql, {
      type: QueryTypes.SELECT,
      replacements: {
        teamId,
      },
    });

    const counts: {
      activeCount: string;
      adminCount: string;
      invitedCount: string;
      suspendedCount: string;
      viewerCount: string;
      count: string;
    } = results;

    return {
      active: parseInt(counts.activeCount),
      admins: parseInt(counts.adminCount),
      viewers: parseInt(counts.viewerCount),
      all: parseInt(counts.count),
      invited: parseInt(counts.invitedCount),
      suspended: parseInt(counts.suspendedCount),
    };
  };
}

export default User;
