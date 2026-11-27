import React from "react";
import { archivePulse, communityThreads, recentComments } from "@/src/modules/experience/site-content";
import { Icon } from "@/src/modules/experience/ui";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export default function CommunityPage() {
  return (
    <ProtectedWorkspaceShell eyebrow="SCHOLARLY DISCOURSE" title="Community Hub">
      <div>
        <div className="community-hero">
          <div>
            <h2>Community Hub</h2>
            <p>
              Connect with scholars, challenge ideas, and debate how research should be translated into living
              curriculum for South Asian learners.
            </p>
          </div>
          <button className="button button--primary" type="button">
            Start a Thread
          </button>
        </div>

        <div className="tab-row" role="tablist" aria-label="Community filters">
          <button aria-selected="true" className="tab-row__tab tab-row__tab--active" role="tab" type="button">
            Trending
          </button>
          <button aria-selected="false" className="tab-row__tab" role="tab" type="button">
            Newest
          </button>
          <button aria-selected="false" className="tab-row__tab" role="tab" type="button">
            Top
          </button>
        </div>

        <div className="community-grid">
          <section className="discussion-list">
            {communityThreads.map((thread) => (
              <article key={thread.title} className="discussion-card">
                <div className="discussion-card__votes">
                  <strong>{thread.votes}</strong>
                  <span>votes</span>
                </div>

                <div className="discussion-card__body">
                  <div className="discussion-card__meta">
                    <span className="pill">{thread.category}</span>
                    <span>
                      {thread.author} · {thread.timestamp}
                    </span>
                  </div>
                  <h3>{thread.title}</h3>
                  <p>{thread.excerpt}</p>

                  {thread.hasGallery ? (
                    <div className="gallery-strip" aria-label="Thread gallery preview">
                      <div className="gallery-strip__item" />
                      <div className="gallery-strip__item" />
                      <div className="gallery-strip__item gallery-strip__item--count">+4 More</div>
                    </div>
                  ) : null}

                  <div className="discussion-card__actions">
                    <button className="inline-action" type="button">
                      <Icon className="icon-xs" name="community" />
                      {thread.replies}
                    </button>
                    <button className="inline-action" type="button">
                      <Icon className="icon-xs" name="book" />
                      {thread.saved}
                    </button>
                    <button className="inline-action" type="button">
                      <Icon className="icon-xs" name="arrow-right" />
                      Share
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="activity-rail">
            <section className="rail-panel">
              <div className="rail-panel__header">
                <h3>Recent Comments</h3>
                <button className="button button--ghost button--small" type="button">
                  View All Activity
                </button>
              </div>
              <div className="activity-list">
                {recentComments.map((comment) => (
                  <article key={`${comment.author}-${comment.timestamp}`} className="activity-entry">
                    <strong>{comment.author}</strong>
                    <p>{comment.summary}</p>
                    <span>{comment.timestamp}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="rail-panel">
              <div className="rail-panel__header">
                <h3>Archive Pulse</h3>
                <Icon className="icon-sm" name="spark" />
              </div>
              <div className="stats-grid">
                {archivePulse.map((stat) => (
                  <div key={stat.label} className="stat-card">
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </ProtectedWorkspaceShell>
  );
}
