import { WorkerEntrypoint } from "cloudflare:workers";
import api from "../api.js";
import { hash } from "../auth/crypto.js";
import { json } from "../auth/http.js";
import { buildCorsHeaders, resolveCorsOrigin } from "../lib/cors.js";
import { commentPageSize, editPageSize, handleComments, replyPageSize } from "../github/comments.js";
import { handleDiscussionCounts } from "../github/discussions.js";
import { discussionScopes, initialReplyCount } from "../../shared/discussions.js";
import { handleCommentAttachment } from "../github/comment-attachments.js";
import { localAttachment, storeLocalAttachment } from "./comment-attachments.js";

export { GameRoom } from "../api.js";

const threadKey = (id) => "thread:" + id;
const threadPrefix = (categoryId) => `local_${categoryId}_`;
const threadId = async (categoryId, title) => threadPrefix(categoryId) + await hash(title);

function connection(items, size, after, newest = false) {
  const start = after && /^\d+$/.test(after) ? Number(after) : 0;
  const ordered = newest ? items.toReversed() : items;
  const end = Math.min(start + size, items.length);
  const nodes = ordered.slice(start, end);
  return {
    nodes: newest ? nodes.reverse() : nodes,
    totalCount: items.length,
    pageInfo: {
      hasNextPage: newest ? start > 0 : end < items.length,
      hasPreviousPage: newest ? end < items.length : start > 0,
      startCursor: newest ? String(end) : String(start),
      endCursor: newest ? String(start) : String(end),
    },
  };
}

const replyCount = ({ replies = [] }) => ({ replies: { totalCount: replies.length } });
const nodeFields = ({ id, title, url, locked, repository, category }) => ({ id, title, url, locked, repository, category });

function reactionFields(node, viewer) {
  return {
    viewerCanReact: Boolean(viewer),
    reactionGroups: Object.entries(node.reactions || {}).filter(([, users]) => users.length)
      .map(([content, users]) => ({
        content, viewerHasReacted: Boolean(viewer && users.includes(viewer.id)),
        users: { totalCount: users.length },
      })),
  };
}

function commentFields(comment, viewer) {
  const { id, author, body, createdAt, lastEditedAt, isMinimized, minimizedReason } = comment;
  const owns = Boolean(viewer && (author.id ? viewer.id === author.id : viewer.name === author.login));
  return {
    id, author, body, createdAt, lastEditedAt, isMinimized, minimizedReason,
    viewerCanUpdate: owns, viewerCanDelete: owns, ...reactionFields(comment, viewer),
  };
}

function storedEdits(comment) {
  return comment.edits || (comment.lastEditedAt
    ? [{ id: comment.id, editedAt: comment.lastEditedAt, editor: null }]
    : []);
}

function findComment(thread, id) {
  for (const comment of thread?.comments || []) {
    if (comment.id === id) return { comment, siblings: thread.comments };
    const reply = comment.replies.find((item) => item.id === id);
    if (reply) return { comment: reply, parent: comment, siblings: comment.replies };
  }
  return {};
}

function importComment({ replies, ...comment }) {
  return { ...comment, replies: (replies?.nodes || []).map(importComment) };
}

function resolveThreadReplies(comment, query, viewer) {
  if (/\breplies\s*\(\s*first:\s*1\s*\)\s*\{\s*totalCount\s*\}/.test(query)) {
    return { totalCount: comment.replies.length };
  }
  const match = query.match(/\breplies\s*\(\s*first:\s*(\d+)\)/);
  const limit = match ? Number(match[1]) : replyPageSize;
  return connection(
    comment.replies.map((reply) => commentFields(reply, viewer)),
    limit,
  );
}

// This in-process transport implements the GitHub operations the shared handlers call.
function localGithub(env, repository, target, viewer) {
  const store = env.LOCAL_COMMENTS;
  const repo = Object.values(discussionScopes).find(({ repo }) => repo.name === repository)?.repo;
  const load = (id) => store.get(threadKey(id), "json");
  const save = (thread) => store.put(threadKey(thread.id), JSON.stringify(thread));
  const targetThread = async () => {
    const id = await threadId(target.category.id, target.term);
    const existing = await load(id);
    if (existing) return existing;
    const legacy = await store.get("discussion:" + target.url, "json");
    if (!legacy?.length) return null;
    return {
      id, title: target.term, url: target.url, locked: false,
      repository: { id: repo.id, isPrivate: false }, category: { id: target.category.id },
      comments: legacy.map(importComment),
    };
  };

  return {
    async graphql(query, variables = {}) {
      const operation = query.match(/\b(?:query|mutation)\s+(\w+)/)?.[1];
      const { id, after, before, cursor, input } = variables;

      switch (operation) {
        case "DiscussionRepository":
          return { repository: { id: repo.id, hasDiscussionsEnabled: true } };

        case "SearchDiscussion": {
          const thread = await targetThread();
          return { search: { nodes: thread ? [nodeFields(thread)] : [] } };
        }

        case "RecentDiscussions": {
          const thread = await targetThread();
          return { repository: { discussions: connection(thread ? [nodeFields(thread)] : [], 100, after) } };
        }

        case "CreateDiscussion": {
          const thread = {
            id: await threadId(input.categoryId, input.title),
            title: input.title,
            url: target.url,
            locked: false,
            repository: { id: input.repositoryId, isPrivate: false },
            category: { id: input.categoryId },
            comments: [],
          };
          await save(thread);
          return { createDiscussion: { discussion: nodeFields(thread) } };
        }

        case "DiscussionCountPage": {
          const page = await store.list({
            prefix: threadKey(threadPrefix(variables.categoryId)),
            limit: 100,
            cursor: cursor || undefined,
          });
          const threads = await Promise.all(page.keys.map(({ name }) => store.get(name, "json")));
          return {
            repository: {
              id: repo.id,
              isPrivate: false,
              discussions: {
                nodes: threads.filter(Boolean).map((thread) => ({
                  id: thread.id,
                  title: thread.title,
                  comments: connection(thread.comments.map(replyCount), 100),
                })),
                pageInfo: { hasNextPage: !page.list_complete, endCursor: page.cursor },
              },
            },
          };
        }

        case "DiscussionCommentCountPage": {
          const thread = target ? await targetThread() : await load(variables.discussionId);
          return { node: thread && { comments: connection(thread.comments.map(replyCount), 100, cursor) } };
        }

        case "DiscussionById": {
          const thread = await targetThread();
          return { node: thread && id === thread.id ? nodeFields(thread) : null };
        }

        case "DiscussionReactionPermission": {
          const thread = await targetThread();
          return { node: thread && id === thread.id ? reactionFields(thread, viewer) : null };
        }

        case "DiscussionHeatRanking": {
          const thread = await targetThread();
          if (!thread || id !== thread.id) return { node: null };
          const items = thread.comments.map((comment) => ({
            id: comment.id,
            isMinimized: comment.isMinimized,
            ...reactionFields(comment, viewer),
            ...replyCount(comment),
          }));
          return { node: { id: thread.id, comments: connection(items, 100, after) } };
        }

        case "TopComments": {
          const thread = await targetThread();
          if (!thread || id !== thread.id) return { node: null };
          return {
            node: { ...nodeFields(thread), ...reactionFields(thread, viewer) },
            nodes: variables.ids.map((commentId) => {
              const comment = thread.comments.find((item) => item.id === commentId);
              if (!comment) return null;
              return {
                ...commentFields(comment, viewer),
                discussion: { id: thread.id },
                replies: resolveThreadReplies(comment, query, viewer),
              };
            }),
          };
        }

        case "OldestComments":
        case "NewestComments": {
          const thread = await targetThread();
          if (!thread || id !== thread.id) return { node: null };
          const newest = operation === "NewestComments";
          const page = connection(thread.comments, commentPageSize, after, newest);
          return {
            node: {
              ...nodeFields(thread),
              ...reactionFields(thread, viewer),
              comments: {
                ...page,
                nodes: page.nodes.map((comment) => ({
                  ...commentFields(comment, viewer),
                  replies: resolveThreadReplies(comment, query, viewer),
                })),
              },
            },
          };
        }

        case "DiscussionCommentEdits": {
          const thread = await targetThread();
          const { comment } = findComment(thread, id);
          if (!comment) return { node: null };
          const edits = storedEdits(comment);
          const end = before == null ? edits.length : Number(before);
          const start = Math.max(0, end - editPageSize);
          return {
            node: {
              discussion: { id: thread.id },
              isMinimized: comment.isMinimized,
              userContentEdits: {
                nodes: edits.slice(start, end),
                pageInfo: { hasPreviousPage: start > 0, startCursor: String(start) },
              },
            },
          };
        }

        case "DiscussionCommentById":
        case "DiscussionReplies": {
          const thread = await targetThread();
          const { comment, parent } = findComment(thread, id);
          return {
            node: comment
              ? {
                  ...commentFields(comment, viewer),
                  discussion: { id: thread.id },
                  replyTo: parent && { id: parent.id },
                  replies: connection(
                    comment.replies.map((reply) => commentFields(reply, viewer)),
                    replyPageSize,
                    after,
                  ),
                }
              : null,
          };
        }

        case "addDiscussionComment": {
          const thread = await targetThread();
          const targetComment = input.replyToId ? findComment(thread, input.replyToId).comment : null;
          const created = {
            id: crypto.randomUUID(),
            body: input.body,
            createdAt: new Date().toISOString(),
            author: { id: viewer.id, login: viewer.login || viewer.name, avatarUrl: viewer.avatarUrl },
            replies: [],
          };
          (targetComment ? targetComment.replies : thread.comments).push(created);
          await save(thread);
          return { addDiscussionComment: { comment: commentFields(created, viewer) } };
        }

        case "updateDiscussionComment": {
          const thread = await targetThread();
          const { comment } = findComment(thread, input.commentId);
          if (!comment) throw new Error("Comment not found");
          comment.edits = storedEdits(comment);
          comment.body = input.body;
          comment.lastEditedAt = new Date().toISOString();
          comment.edits.push({
            id: crypto.randomUUID(),
            editedAt: comment.lastEditedAt,
            editor: { login: viewer.login || viewer.name },
          });
          await save(thread);
          return {};
        }

        case "deleteDiscussionComment": {
          const thread = await targetThread();
          const { comment, siblings } = findComment(thread, input.id);
          if (!comment) throw new Error("Comment not found");
          siblings.splice(siblings.indexOf(comment), 1);
          await save(thread);
          return {};
        }

        case "addReaction":
        case "removeReaction": {
          const thread = await targetThread();
          const { comment } = input.subjectId ? findComment(thread, input.subjectId) : {};
          const subject = comment || thread;
          subject.reactions ||= {};
          const users = new Set(subject.reactions[input.content]);
          if (operation === "addReaction") users.add(viewer.id);
          else users.delete(viewer.id);
          subject.reactions[input.content] = [...users];
          await save(thread);
          return {};
        }

        default:
          throw new Error(`Unsupported local GitHub operation: ${operation}`);
      }
    },
  };
}

export class CommentsInternal extends WorkerEntrypoint {
  async handle(request, token, target) {
    if (new URL(request.url).pathname === "/api/comments/attachments") {
      return handleCommentAttachment(request, this.env, token, target, {
        upload: (attachment) => storeLocalAttachment(this.env, new URL(request.url).origin, attachment),
      });
    }
    return handleComments(request, this.env, token, target, {
      createClient: (env, repository) => localGithub(env, repository, target),
      userGraphql: (viewer, query, variables) =>
        localGithub(this.env, target.repo.name, target, viewer).graphql(query, variables),
    });
  }
}

export default {
  fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    if (pathname.startsWith("/comments/attachments/local/")) return localAttachment(request, env);
    if (pathname === "/github/discussions/counts") {
      const corsOrigin = resolveCorsOrigin(request, env);
      const corsHeaders = buildCorsHeaders(corsOrigin);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      return handleDiscussionCounts(request, env, corsHeaders, localGithub);
    }
    if (pathname.startsWith("/github/") || pathname === "/random-hero") return json({}, 404);
    return api.fetch(request, env, ctx);
  },
};
