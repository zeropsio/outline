import path from "path";
import invariant from "invariant";
import { find, orderBy, filter, compact, omitBy } from "lodash";
import { observable, action, computed, runInAction } from "mobx";
import { DateFilter } from "@shared/types";
import { subtractDate } from "@shared/utils/date";
import { bytesToHumanReadable } from "@shared/utils/files";
import naturalSort from "@shared/utils/naturalSort";
import { DocumentValidation } from "@shared/validations";
import BaseStore from "~/stores/BaseStore";
import RootStore from "~/stores/RootStore";
import Document from "~/models/Document";
import env from "~/env";
import {
  FetchOptions,
  PaginationParams,
  SearchResult,
  NavigationNode,
} from "~/types";
import { client } from "~/utils/ApiClient";

type FetchPageParams = PaginationParams & {
  template?: boolean;
  collectionId?: string;
};

export type SearchParams = {
  offset?: number;
  limit?: number;
  dateFilter?: DateFilter;
  includeArchived?: boolean;
  includeDrafts?: boolean;
  collectionId?: string;
  userId?: string;
  shareId?: string;
};

type ImportOptions = {
  publish?: boolean;
};

export default class DocumentsStore extends BaseStore<Document> {
  sharedTreeCache: Map<string, NavigationNode | undefined> = new Map();

  @observable
  searchCache: Map<string, SearchResult[] | undefined> = new Map();

  @observable
  backlinks: Map<string, string[]> = new Map();

  @observable
  movingDocumentId: string | null | undefined;

  importFileTypes: string[] = [
    ".md",
    ".doc",
    ".docx",
    "text/markdown",
    "text/plain",
    "text/html",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  constructor(rootStore: RootStore) {
    super(rootStore, Document);
  }

  @computed
  get all(): Document[] {
    return filter(
      this.orderedData,
      (d) => !d.archivedAt && !d.deletedAt && !d.template
    );
  }

  @computed
  get recentlyViewed(): Document[] {
    return orderBy(
      this.all.filter((d) => d.lastViewedAt),
      "lastViewedAt",
      "desc"
    );
  }

  @computed
  get recentlyUpdated(): Document[] {
    return orderBy(this.all, "updatedAt", "desc");
  }

  get templates(): Document[] {
    return orderBy(
      filter(
        this.orderedData,
        (d) => !d.archivedAt && !d.deletedAt && d.template
      ),
      "updatedAt",
      "desc"
    );
  }

  createdByUser(userId: string): Document[] {
    return orderBy(
      filter(this.all, (d) => d.createdBy.id === userId),
      "updatedAt",
      "desc"
    );
  }

  inCollection(collectionId: string): Document[] {
    return filter(
      this.all,
      (document) => document.collectionId === collectionId
    );
  }

  templatesInCollection(collectionId: string): Document[] {
    return orderBy(
      filter(
        this.orderedData,
        (d) =>
          !d.archivedAt &&
          !d.deletedAt &&
          d.template === true &&
          d.collectionId === collectionId
      ),
      "updatedAt",
      "desc"
    );
  }

  publishedInCollection(collectionId: string): Document[] {
    return filter(
      this.all,
      (document) =>
        document.collectionId === collectionId && !!document.publishedAt
    );
  }

  rootInCollection(collectionId: string): Document[] {
    const collection = this.rootStore.collections.get(collectionId);

    if (!collection) {
      return [];
    }

    const drafts = this.drafts({ collectionId });

    return compact([
      ...drafts,
      ...collection.sortedDocuments.map((node) => this.get(node.id)),
    ]);
  }

  leastRecentlyUpdatedInCollection(collectionId: string): Document[] {
    return orderBy(this.inCollection(collectionId), "updatedAt", "asc");
  }

  recentlyUpdatedInCollection(collectionId: string): Document[] {
    return orderBy(this.inCollection(collectionId), "updatedAt", "desc");
  }

  recentlyPublishedInCollection(collectionId: string): Document[] {
    return orderBy(
      this.publishedInCollection(collectionId),
      "publishedAt",
      "desc"
    );
  }

  alphabeticalInCollection(collectionId: string): Document[] {
    return naturalSort(this.inCollection(collectionId), "title");
  }

  searchResults(query: string): SearchResult[] | undefined {
    return this.searchCache.get(query);
  }

  @computed
  get archived(): Document[] {
    return orderBy(this.orderedData, "archivedAt", "desc").filter(
      (d) => d.archivedAt && !d.deletedAt
    );
  }

  @computed
  get deleted(): Document[] {
    return orderBy(this.orderedData, "deletedAt", "desc").filter(
      (d) => d.deletedAt
    );
  }

  @computed
  get templatesAlphabetical(): Document[] {
    return naturalSort(this.templates, "title");
  }

  @computed
  get totalDrafts(): number {
    return this.drafts().length;
  }

  drafts = (
    options: PaginationParams & {
      dateFilter?: DateFilter;
      collectionId?: string;
    } = {}
  ): Document[] => {
    let drafts = filter(
      orderBy(this.all, "updatedAt", "desc"),
      (doc) => !doc.publishedAt
    );

    if (options.dateFilter) {
      drafts = filter(
        drafts,
        (draft) =>
          new Date(draft.updatedAt) >=
          subtractDate(new Date(), options.dateFilter || "year")
      );
    }

    if (options.collectionId) {
      drafts = filter(drafts, {
        collectionId: options.collectionId,
      });
    }

    return drafts;
  };

  @computed
  get active(): Document | undefined {
    return this.rootStore.ui.activeDocumentId
      ? this.data.get(this.rootStore.ui.activeDocumentId)
      : undefined;
  }

  @action
  fetchBacklinks = async (documentId: string): Promise<void> => {
    const res = await client.post(`/documents.list`, {
      backlinkDocumentId: documentId,
    });
    invariant(res?.data, "Document list not available");
    const { data } = res;

    runInAction("DocumentsStore#fetchBacklinks", () => {
      data.forEach(this.add);
      this.addPolicies(res.policies);

      this.backlinks.set(
        documentId,
        data.map((doc: Partial<Document>) => doc.id)
      );
    });
  };

  getBacklinkedDocuments(documentId: string): Document[] {
    const documentIds = this.backlinks.get(documentId) || [];
    return orderBy(
      compact(documentIds.map((id) => this.data.get(id))),
      "updatedAt",
      "desc"
    );
  }

  getSharedTree(documentId: string): NavigationNode | undefined {
    return this.sharedTreeCache.get(documentId);
  }

  @action
  fetchChildDocuments = async (documentId: string): Promise<void> => {
    const res = await client.post(`/documents.list`, {
      parentDocumentId: documentId,
    });
    invariant(res?.data, "Document list not available");
    const { data } = res;

    runInAction("DocumentsStore#fetchChildDocuments", () => {
      data.forEach(this.add);
      this.addPolicies(res.policies);
    });
  };

  @action
  fetchNamedPage = async (
    request = "list",
    options: FetchPageParams | undefined
  ): Promise<Document[]> => {
    this.isFetching = true;

    try {
      const res = await client.post(`/documents.${request}`, options);
      invariant(res?.data, "Document list not available");
      runInAction("DocumentsStore#fetchNamedPage", () => {
        res.data.forEach(this.add);
        this.addPolicies(res.policies);
        this.isLoaded = true;
      });
      return res.data;
    } finally {
      this.isFetching = false;
    }
  };

  @action
  fetchArchived = async (options?: PaginationParams): Promise<Document[]> => {
    return this.fetchNamedPage("archived", options);
  };

  @action
  fetchDeleted = async (options?: PaginationParams): Promise<Document[]> => {
    return this.fetchNamedPage("deleted", options);
  };

  @action
  fetchRecentlyUpdated = async (
    options?: PaginationParams
  ): Promise<Document[]> => {
    return this.fetchNamedPage("list", options);
  };

  @action
  fetchTemplates = async (options?: PaginationParams): Promise<Document[]> => {
    return this.fetchNamedPage("list", { ...options, template: true });
  };

  @action
  fetchAlphabetical = async (
    options?: PaginationParams
  ): Promise<Document[]> => {
    return this.fetchNamedPage("list", {
      sort: "title",
      direction: "ASC",
      ...options,
    });
  };

  @action
  fetchLeastRecentlyUpdated = async (
    options?: PaginationParams
  ): Promise<Document[]> => {
    return this.fetchNamedPage("list", {
      sort: "updatedAt",
      direction: "ASC",
      ...options,
    });
  };

  @action
  fetchRecentlyPublished = async (
    options?: PaginationParams
  ): Promise<Document[]> => {
    return this.fetchNamedPage("list", {
      sort: "publishedAt",
      direction: "DESC",
      ...options,
    });
  };

  @action
  fetchRecentlyViewed = async (
    options?: PaginationParams
  ): Promise<Document[]> => {
    return this.fetchNamedPage("viewed", options);
  };

  @action
  fetchStarred = (options?: PaginationParams): Promise<Document[]> => {
    return this.fetchNamedPage("starred", options);
  };

  @action
  fetchDrafts = (options?: PaginationParams): Promise<Document[]> => {
    return this.fetchNamedPage("drafts", options);
  };

  @action
  fetchOwned = (options?: PaginationParams): Promise<Document[]> => {
    return this.fetchNamedPage("list", options);
  };

  @action
  searchTitles = async (query: string) => {
    const res = await client.post("/documents.search_titles", {
      query,
    });
    invariant(res?.data, "Search response should be available");
    // add the documents and associated policies to the store
    res.data.forEach(this.add);
    this.addPolicies(res.policies);
    return res.data;
  };

  @action
  search = async (
    query: string,
    options: SearchParams
  ): Promise<SearchResult[]> => {
    const compactedOptions = omitBy(options, (o) => !o);
    const res = await client.post("/documents.search", {
      ...compactedOptions,
      query,
    });
    invariant(res?.data, "Search response should be available");

    // add the documents and associated policies to the store
    res.data.forEach((result: SearchResult) => this.add(result.document));
    this.addPolicies(res.policies);

    // store a reference to the document model in the search cache instead
    // of the original result from the API.
    const results: SearchResult[] = compact(
      res.data.map((result: SearchResult) => {
        const document = this.data.get(result.document.id);
        if (!document) {
          return null;
        }
        return {
          id: document.id,
          ranking: result.ranking,
          context: result.context,
          document,
        };
      })
    );
    const existing = this.searchCache.get(query) || [];
    // splice modifies any existing results, taking into account pagination
    existing.splice(options.offset || 0, options.limit || 0, ...results);
    this.searchCache.set(query, existing);
    return res.data;
  };

  @action
  prefetchDocument = async (id: string) => {
    if (!this.data.get(id) && !this.getByUrl(id)) {
      return this.fetch(id, {
        prefetch: true,
      });
    }

    return;
  };

  @action
  templatize = async (id: string): Promise<Document | null | undefined> => {
    const doc: Document | null | undefined = this.data.get(id);
    invariant(doc, "Document should exist");

    if (doc.template) {
      return;
    }

    const res = await client.post("/documents.templatize", {
      id,
    });
    invariant(res?.data, "Document not available");
    this.addPolicies(res.policies);
    this.add(res.data);
    return this.data.get(res.data.id);
  };

  @action
  fetchWithSharedTree = async (
    id: string,
    options: FetchOptions = {}
  ): Promise<{
    document: Document;
    sharedTree?: NavigationNode;
  }> => {
    if (!options.prefetch) {
      this.isFetching = true;
    }

    try {
      const doc: Document | null | undefined =
        this.data.get(id) || this.getByUrl(id);
      const policy = doc ? this.rootStore.policies.get(doc.id) : undefined;

      if (doc && policy && !options.force) {
        if (!options.shareId) {
          return {
            document: doc,
          };
        } else if (this.sharedTreeCache.has(options.shareId)) {
          return {
            document: doc,
            sharedTree: this.sharedTreeCache.get(options.shareId),
          };
        }
      }

      const res = await client.post("/documents.info", {
        id,
        shareId: options.shareId,
        apiVersion: 2,
      });

      invariant(res?.data, "Document not available");
      this.addPolicies(res.policies);
      this.add(res.data.document);

      const document = this.data.get(res.data.document.id);
      invariant(document, "Document not available");

      if (options.shareId) {
        this.sharedTreeCache.set(options.shareId, res.data.sharedTree);
        return {
          document,
          sharedTree: res.data.sharedTree,
        };
      }

      return {
        document,
      };
    } finally {
      this.isFetching = false;
    }
  };

  @action
  move = async (
    documentId: string,
    collectionId: string,
    parentDocumentId?: string | null,
    index?: number | null
  ) => {
    this.movingDocumentId = documentId;

    try {
      const res = await client.post("/documents.move", {
        id: documentId,
        collectionId,
        parentDocumentId,
        index,
      });
      invariant(res?.data, "Data not available");
      res.data.documents.forEach(this.add);
      res.data.collections.forEach(this.rootStore.collections.add);
      this.addPolicies(res.policies);
    } finally {
      this.movingDocumentId = undefined;
    }
  };

  @action
  duplicate = async (document: Document): Promise<Document> => {
    const append = " (duplicate)";
    const res = await client.post("/documents.create", {
      publish: !!document.publishedAt,
      parentDocumentId: document.parentDocumentId,
      collectionId: document.collectionId,
      template: document.template,
      title: `${document.title.slice(
        0,
        DocumentValidation.maxTitleLength - append.length
      )}${append}`,
      text: document.text,
    });
    invariant(res?.data, "Data should be available");
    const collection = this.getCollectionForDocument(document);
    if (collection) {
      collection.refresh();
    }
    this.addPolicies(res.policies);
    return this.add(res.data);
  };

  @action
  import = async (
    file: File,
    parentDocumentId: string | null | undefined,
    collectionId: string | null | undefined,
    options: ImportOptions
  ) => {
    // file.type can be an empty string sometimes
    if (
      file.type &&
      !this.importFileTypes.includes(file.type) &&
      !this.importFileTypes.includes(path.extname(file.name))
    ) {
      throw new Error(`The selected file type is not supported (${file.type})`);
    }

    if (file.size > env.MAXIMUM_IMPORT_SIZE) {
      throw new Error(
        `The selected file was larger than the ${bytesToHumanReadable(
          env.MAXIMUM_IMPORT_SIZE
        )} maximum size`
      );
    }

    const title = file.name.replace(/\.[^/.]+$/, "");
    const formData = new FormData();
    [
      {
        key: "parentDocumentId",
        value: parentDocumentId,
      },
      {
        key: "collectionId",
        value: collectionId,
      },
      {
        key: "title",
        value: title,
      },
      {
        key: "publish",
        value: options.publish,
      },
      {
        key: "file",
        value: file,
      },
    ].forEach((info) => {
      if (typeof info.value === "string" && info.value) {
        formData.append(info.key, info.value);
      }

      if (typeof info.value === "boolean") {
        formData.append(info.key, info.value.toString());
      }

      if (info.value instanceof File) {
        formData.append(info.key, info.value);
      }
    });
    const res = await client.post("/documents.import", formData);
    invariant(res?.data, "Data should be available");
    this.addPolicies(res.policies);
    return this.add(res.data);
  };

  @action
  removeCollectionDocuments(collectionId: string) {
    const documents = this.inCollection(collectionId);
    const documentIds = documents.map((doc) => doc.id);
    documentIds.forEach((id) => this.remove(id));
  }

  @action
  async update(
    params: {
      id: string;
      title: string;
      text?: string;
      fullWidth?: boolean;
      templateId?: string;
    },
    options?: {
      publish?: boolean;
      done?: boolean;
      autosave?: boolean;
      lastRevision: number;
    }
  ) {
    const document = await super.update(params, options);

    // Because the collection object contains the url and title
    // we need to ensure they are updated there as well.
    const collection = this.getCollectionForDocument(document);
    if (collection) {
      collection.updateDocument(document);
    }
    return document;
  }

  @action
  async delete(
    document: Document,
    options?: {
      permanent: boolean;
    }
  ) {
    await super.delete(document, options);
    // check to see if we have any shares related to this document already
    // loaded in local state. If so we can go ahead and remove those too.
    const share = this.rootStore.shares.getByDocumentId(document.id);

    if (share) {
      this.rootStore.shares.remove(share.id);
    }

    const collection = this.getCollectionForDocument(document);
    if (collection) {
      collection.refresh();
    }
  }

  @action
  archive = async (document: Document) => {
    const res = await client.post("/documents.archive", {
      id: document.id,
    });
    runInAction("Document#archive", () => {
      invariant(res?.data, "Data should be available");
      document.updateFromJson(res.data);
      this.addPolicies(res.policies);
    });
    const collection = this.getCollectionForDocument(document);
    if (collection) {
      collection.refresh();
    }
  };

  @action
  restore = async (
    document: Document,
    options: {
      revisionId?: string;
      collectionId?: string;
    } = {}
  ) => {
    const res = await client.post("/documents.restore", {
      id: document.id,
      revisionId: options.revisionId,
      collectionId: options.collectionId,
    });
    runInAction("Document#restore", () => {
      invariant(res?.data, "Data should be available");
      document.updateFromJson(res.data);
      this.addPolicies(res.policies);
    });
    const collection = this.getCollectionForDocument(document);
    if (collection) {
      collection.refresh();
    }
  };

  @action
  unpublish = async (document: Document) => {
    const res = await client.post("/documents.unpublish", {
      id: document.id,
    });
    runInAction("Document#unpublish", () => {
      invariant(res?.data, "Data should be available");
      document.updateFromJson(res.data);
      this.addPolicies(res.policies);
    });
    const collection = this.getCollectionForDocument(document);
    if (collection) {
      collection.refresh();
    }
  };

  star = (document: Document) => {
    return this.rootStore.stars.create({
      documentId: document.id,
    });
  };

  unstar = (document: Document) => {
    const star = this.rootStore.stars.orderedData.find(
      (star) => star.documentId === document.id
    );
    return star?.delete();
  };

  subscribe = (document: Document) => {
    return this.rootStore.subscriptions.create({
      documentId: document.id,
      event: "documents.update",
    });
  };

  unsubscribe = (userId: string, document: Document) => {
    const subscription = this.rootStore.subscriptions.orderedData.find(
      (subscription) =>
        subscription.documentId === document.id &&
        subscription.userId === userId
    );

    return subscription?.delete();
  };

  getByUrl = (url = ""): Document | undefined => {
    return find(this.orderedData, (doc) => url.endsWith(doc.urlId));
  };

  getCollectionForDocument(document: Document) {
    return this.rootStore.collections.data.get(document.collectionId);
  }
}
