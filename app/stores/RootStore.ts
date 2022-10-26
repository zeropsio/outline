import ApiKeysStore from "./ApiKeysStore";
import AuthStore from "./AuthStore";
import AuthenticationProvidersStore from "./AuthenticationProvidersStore";
import CollectionGroupMembershipsStore from "./CollectionGroupMembershipsStore";
import CollectionsStore from "./CollectionsStore";
import DialogsStore from "./DialogsStore";
import DocumentPresenceStore from "./DocumentPresenceStore";
import DocumentsStore from "./DocumentsStore";
import EventsStore from "./EventsStore";
import FileOperationsStore from "./FileOperationsStore";
import GroupMembershipsStore from "./GroupMembershipsStore";
import GroupsStore from "./GroupsStore";
import IntegrationsStore from "./IntegrationsStore";
import MembershipsStore from "./MembershipsStore";
import NotificationSettingsStore from "./NotificationSettingsStore";
import PinsStore from "./PinsStore";
import PoliciesStore from "./PoliciesStore";
import RevisionsStore from "./RevisionsStore";
import SearchesStore from "./SearchesStore";
import SharesStore from "./SharesStore";
import StarsStore from "./StarsStore";
import SubscriptionsStore from "./SubscriptionsStore";
import ToastsStore from "./ToastsStore";
import UiStore from "./UiStore";
import UsersStore from "./UsersStore";
import ViewsStore from "./ViewsStore";
import WebhookSubscriptionsStore from "./WebhookSubscriptionStore";

export default class RootStore {
  apiKeys: ApiKeysStore;
  auth: AuthStore;
  authenticationProviders: AuthenticationProvidersStore;
  collections: CollectionsStore;
  collectionGroupMemberships: CollectionGroupMembershipsStore;
  dialogs: DialogsStore;
  documents: DocumentsStore;
  events: EventsStore;
  groups: GroupsStore;
  groupMemberships: GroupMembershipsStore;
  integrations: IntegrationsStore;
  memberships: MembershipsStore;
  notificationSettings: NotificationSettingsStore;
  presence: DocumentPresenceStore;
  pins: PinsStore;
  policies: PoliciesStore;
  revisions: RevisionsStore;
  searches: SearchesStore;
  shares: SharesStore;
  ui: UiStore;
  stars: StarsStore;
  subscriptions: SubscriptionsStore;
  users: UsersStore;
  views: ViewsStore;
  toasts: ToastsStore;
  fileOperations: FileOperationsStore;
  webhookSubscriptions: WebhookSubscriptionsStore;

  constructor() {
    // PoliciesStore must be initialized before AuthStore
    this.policies = new PoliciesStore(this);
    this.apiKeys = new ApiKeysStore(this);
    this.authenticationProviders = new AuthenticationProvidersStore(this);
    this.auth = new AuthStore(this);
    this.collections = new CollectionsStore(this);
    this.collectionGroupMemberships = new CollectionGroupMembershipsStore(this);
    this.dialogs = new DialogsStore();
    this.documents = new DocumentsStore(this);
    this.events = new EventsStore(this);
    this.groups = new GroupsStore(this);
    this.groupMemberships = new GroupMembershipsStore(this);
    this.integrations = new IntegrationsStore(this);
    this.memberships = new MembershipsStore(this);
    this.pins = new PinsStore(this);
    this.notificationSettings = new NotificationSettingsStore(this);
    this.presence = new DocumentPresenceStore();
    this.revisions = new RevisionsStore(this);
    this.searches = new SearchesStore(this);
    this.shares = new SharesStore(this);
    this.stars = new StarsStore(this);
    this.subscriptions = new SubscriptionsStore(this);
    this.ui = new UiStore();
    this.users = new UsersStore(this);
    this.views = new ViewsStore(this);
    this.fileOperations = new FileOperationsStore(this);
    this.toasts = new ToastsStore();
    this.webhookSubscriptions = new WebhookSubscriptionsStore(this);
  }

  logout() {
    this.apiKeys.clear();
    this.authenticationProviders.clear();
    // this.auth omitted for reasons...
    this.collections.clear();
    this.collectionGroupMemberships.clear();
    this.documents.clear();
    this.events.clear();
    this.groups.clear();
    this.groupMemberships.clear();
    this.integrations.clear();
    this.memberships.clear();
    this.notificationSettings.clear();
    this.presence.clear();
    this.pins.clear();
    this.policies.clear();
    this.revisions.clear();
    this.searches.clear();
    this.shares.clear();
    this.stars.clear();
    this.subscriptions.clear();
    this.fileOperations.clear();
    // this.ui omitted to keep ui settings between sessions
    this.users.clear();
    this.views.clear();
    this.webhookSubscriptions.clear();
  }
}
