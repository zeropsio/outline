import Router from "koa-router";
import { sequelize } from "@server/database/sequelize";
import auth from "@server/middlewares/authentication";
import { AuthenticationProvider, Event } from "@server/models";
import { authorize } from "@server/policies";
import {
  presentAuthenticationProvider,
  presentPolicies,
} from "@server/presenters";
import { assertUuid, assertPresent } from "@server/validation";
import allAuthenticationProviders from "../auth/providers";

const router = new Router();

router.post(
  "authenticationProviders.info",
  auth({ admin: true }),
  async (ctx) => {
    const { id } = ctx.request.body;
    assertUuid(id, "id is required");

    const { user } = ctx.state;
    const authenticationProvider = await AuthenticationProvider.findByPk(id);
    authorize(user, "read", authenticationProvider);

    ctx.body = {
      data: presentAuthenticationProvider(authenticationProvider),
      policies: presentPolicies(user, [authenticationProvider]),
    };
  }
);

router.post(
  "authenticationProviders.update",
  auth({ admin: true }),
  async (ctx) => {
    const { id, isEnabled } = ctx.request.body;
    assertUuid(id, "id is required");
    assertPresent(isEnabled, "isEnabled is required");
    const { user } = ctx.state;

    const authenticationProvider = await sequelize.transaction(
      async (transaction) => {
        const authenticationProvider = await AuthenticationProvider.findByPk(
          id,
          {
            transaction,
            lock: transaction.LOCK.UPDATE,
          }
        );

        authorize(user, "update", authenticationProvider);
        const enabled = !!isEnabled;

        if (enabled) {
          await authenticationProvider.enable({ transaction });
        } else {
          await authenticationProvider.disable({ transaction });
        }

        await Event.create(
          {
            name: "authenticationProviders.update",
            data: {
              enabled,
            },
            modelId: id,
            teamId: user.teamId,
            actorId: user.id,
            ip: ctx.request.ip,
          },
          { transaction }
        );

        return authenticationProvider;
      }
    );

    ctx.body = {
      data: presentAuthenticationProvider(authenticationProvider),
      policies: presentPolicies(user, [authenticationProvider]),
    };
  }
);

router.post(
  "authenticationProviders.list",
  auth({ admin: true }),
  async (ctx) => {
    const { user } = ctx.state;
    authorize(user, "read", user.team);

    const teamAuthenticationProviders = (await user.team.$get(
      "authenticationProviders"
    )) as AuthenticationProvider[];

    const data = allAuthenticationProviders
      .filter((p) => p.id !== "email")
      .map((p) => {
        const row = teamAuthenticationProviders.find((t) => t.name === p.id);

        return {
          id: p.id,
          name: p.id,
          displayName: p.name,
          isEnabled: false,
          isConnected: false,
          ...(row ? presentAuthenticationProvider(row) : {}),
        };
      })
      .sort((a) => (a.isEnabled ? -1 : 1));

    ctx.body = {
      data,
    };
  }
);

export default router;
