<script setup lang="ts">
import { SITE_META } from '~/content/site'

/**
 * The home page's own URL, with the trailing slash, so the canonical link,
 * `og:url`, the JSON-LD and the sitemap all spell it the same way.
 */
const pageUrl = new URL('/', SITE_META.url).href

useSeoMeta({
  title: SITE_META.title,
  description: SITE_META.description,
  author: SITE_META.author,
  ogTitle: SITE_META.title,
  ogDescription: SITE_META.socialDescription,
  ogType: 'website',
  ogUrl: pageUrl,
  ogImage: SITE_META.image,
  ogImageAlt: SITE_META.imageAlt,
  ogImageType: 'image/png',
  ogImageWidth: SITE_META.imageWidth,
  ogImageHeight: SITE_META.imageHeight,
  ogSiteName: SITE_META.siteName,
  ogLocale: SITE_META.locale,
  // The portrait is square; `summary_large_image` would crop it to a strip.
  twitterCard: 'summary',
  twitterTitle: SITE_META.title,
  twitterDescription: SITE_META.socialDescription,
  twitterImage: SITE_META.image,
  twitterImageAlt: SITE_META.imageAlt,
  twitterSite: SITE_META.twitterHandle,
  twitterCreator: SITE_META.twitterHandle,
})

/**
 * Structured data is server-rendered rather than injected after hydration, so
 * crawlers that do not execute JavaScript still see it.
 */
useHead({
  // `keywords` is not part of useSeoMeta's typed surface, so it goes here.
  meta: [{ name: 'keywords', content: SITE_META.keywords }],
  link: [{ rel: 'canonical', href: pageUrl }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${pageUrl}#website`,
            url: pageUrl,
            name: SITE_META.author,
            inLanguage: 'en',
            publisher: { '@id': `${pageUrl}#person` },
          },
          {
            '@type': 'Person',
            '@id': `${pageUrl}#person`,
            name: SITE_META.author,
            jobTitle: SITE_META.jobTitle,
            description: SITE_META.socialDescription,
            worksFor: { '@type': 'Organization', name: SITE_META.employer },
            alumniOf: {
              '@type': 'CollegeOrUniversity',
              name: SITE_META.alumniOf,
            },
            url: pageUrl,
            mainEntityOfPage: pageUrl,
            sameAs: SITE_META.socialProfiles,
            knowsAbout: SITE_META.knowsAbout,
            image: SITE_META.image,
          },
        ],
      }),
    },
  ],
})
</script>

<template>
  <div>
    <!--
      Section order matches the reference `App.tsx`: Hero, About, Experience,
      Skills, Interests, Contact. Navigation and Footer live in the layout.
    -->
    <HeroSection />
    <AboutSection />
    <ExperienceSection />
    <SkillsSection />
    <InterestsSection />
    <ContactSection />
  </div>
</template>
