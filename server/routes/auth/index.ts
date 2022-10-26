import passport from "@outlinewiki/koa-passport";
import { addMonths } from "date-fns";
import Koa from "koa";
import bodyParser from "koa-body";
import Router from "koa-router";
import { AuthenticationError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { defaultRateLimiter } from "@server/middlewares/rateLimiter";
import { Collection, Team, View } from "@server/models";
import providers from "./providers";

const app = new Koa();
const router = new Router();

router.use(passport.initialize());
router.use(defaultRateLimiter());

// dynamically load available authentication provider routes
providers.forEach((provider) => {
  if (provider.enabled) {
    router.use("/", provider.router.routes());
  }
});

router.get("/redirect", auth(), async (ctx) => {
  const { user } = ctx.state;
  const jwtToken = user.getJwtToken();

  if (jwtToken === ctx.params.token) {
    throw AuthenticationError("Cannot extend token");
  }

  // ensure that the lastActiveAt on user is updated to prevent replay requests
  await user.updateActiveAt(ctx, true);

  ctx.cookies.set("accessToken", jwtToken, {
    httpOnly: false,
    sameSite: true,
    expires: addMonths(new Date(), 3),
  });
  const [team, collection, view] = await Promise.all([
    Team.findByPk(user.teamId),
    Collection.findFirstCollectionForUser(user),
    View.findOne({
      where: {
        userId: user.id,
      },
    }),
  ]);

  const defaultCollectionId = team?.defaultCollectionId;

  if (defaultCollectionId) {
    const collection = await Collection.findOne({
      where: {
        id: defaultCollectionId,
        teamId: team.id,
      },
    });

    if (collection) {
      ctx.redirect(`${team.url}${collection.url}`);
      return;
    }
  }

  const hasViewedDocuments = !!view;

  ctx.redirect(
    !hasViewedDocuments && collection
      ? `${team?.url}${collection.url}`
      : `${team?.url}/home`
  );
});

app.use(bodyParser());
app.use(router.routes());

export default app;
