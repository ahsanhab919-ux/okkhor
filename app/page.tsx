import React from "react";
import Link from "next/link";

import { archiveCards, publicNavItems, trustHighlights } from "@/src/modules/experience/site-content";
import { Icon, PublicTopNav } from "@/src/modules/experience/ui";

export default function HomePage() {
  const featured = archiveCards[0];

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell page-shell--wide">
        <section className="cinematic-hero">
          <div className="cinematic-hero__backdrop" aria-hidden="true" />
          <div className="cinematic-hero__scrim" aria-hidden="true" />
          <div className="cinematic-hero__content">
            <div className="cinematic-hero__badges">
              <span className="chip chip--accent">Featured Research</span>
              <span className="chip chip--outline">{featured.episode}</span>
            </div>
            <h1 className="hero-title">
              The World&apos;s Best Research,
              <br />
              <span className="hero-title__accent">Simplified in Bangla.</span>
            </h1>
            <p className="cinematic-hero__lead">
              A premium marketplace where scholars monetize knowledge and learners master the future through
              high-trust, low-friction storytelling.
            </p>
            <div className="hero-actions">
              <Link className="button button--light button--large" href="#archive">
                <Icon className="icon-sm" name="play" />
                Explore the Archive
              </Link>
              <Link className="button button--secondary button--large" href="/auth">
                <Icon className="icon-sm" name="spark" />
                Sign In with Phone
              </Link>
            </div>
            <div className="hero-trust-grid">
              {trustHighlights.map((highlight) => (
                <div key={highlight} className="trust-chip">
                  <Icon className="icon-sm" name="shield" />
                  <span>{highlight}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="content-band" id="archive">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Curated Content</p>
              <h2>Netflix for Knowledge</h2>
            </div>
            <p>
              High-production value research documentaries and deep-dives, organized into bingeable episodes
              for learners across South Asia.
            </p>
          </div>

          <div className="carousel-track">
            {archiveCards.map((card) => (
              <article key={card.title} className="poster-card">
                <div
                  className="poster-card__visual"
                  style={{ background: card.accent }}
                  role="img"
                  aria-label={`${card.title} episode artwork`}
                >
                  <div className="poster-card__badges">
                    <span className="badge-solid">{card.episode}</span>
                    <span className="badge-outline">Research</span>
                  </div>
                  <div className="poster-card__overlay">
                    <p>{card.description}</p>
                  </div>
                </div>
                <div className="poster-card__body">
                  <h3>{card.title}</h3>
                  <p>{card.episode}</p>
                </div>
              </article>
            ))}
          </div>

          <Link className="inline-link inline-link--featured" href="/content">
            Browse Full Archive
            <Icon className="icon-sm" name="arrow-right" />
          </Link>
        </section>

        <section className="community-preview">
          <div className="community-preview__copy">
            <p className="eyebrow eyebrow--blue">Scholarly Discourse</p>
            <h2>Community Hub for discussion, debate, and guided research.</h2>
            <p>
              Connect learners with global researchers, move from passive viewing to active inquiry, and build
              visible trust through participatory knowledge surfaces.
            </p>
          </div>
          <div className="community-preview__cards">
            <div className="mini-panel">
              <div className="mini-panel__header">
                <Icon className="icon-sm" name="community" />
                <strong>Trending Threads</strong>
              </div>
              <p>Historical method, AI literacy, and regional archive debate.</p>
            </div>
            <div className="mini-panel">
              <div className="mini-panel__header">
                <Icon className="icon-sm" name="book" />
                <strong>Scholar Notes</strong>
              </div>
              <p>Structured replies, annotated evidence, and follow-up reading prompts.</p>
            </div>
          </div>
        </section>

        <section className="footer-cta">
          <p className="eyebrow eyebrow--blue">Scholar Growth</p>
          <h2>Ready to illuminate the path for others?</h2>
          <p>
            Join Okkhor as a verified scholar, contribute premium research interpretation, and guide the next
            generation of Bangla-first learning.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary button--large" href="/auth">
              Start Your Journey
            </Link>
            <Link className="button button--ghost button--large" href="/community">
              Talk to a Strategist
            </Link>
          </div>
        </section>

        <footer className="marketing-footer">
          <div className="marketing-footer__links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#ethics">Research Ethics</a>
            <a href="#support">Scholar Support</a>
          </div>
          <p>&copy; 2024 Okkhor. The Illuminated Archive. All Rights Reserved.</p>
        </footer>
      </main>
    </div>
  );
}
