<script setup lang="ts">
import { SITE_META } from '~/content/site'

useSeoMeta({
  title: SITE_META.title,
  description: SITE_META.description,
  author: SITE_META.author,
  ogTitle: SITE_META.title,
  ogDescription: SITE_META.socialDescription,
  ogType: 'website',
  ogUrl: SITE_META.url,
  ogImage: SITE_META.image,
  ogImageAlt: SITE_META.imageAlt,
  ogSiteName: SITE_META.siteName,
  ogLocale: SITE_META.locale,
  twitterCard: 'summary_large_image',
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
  link: [{ rel: 'canonical', href: SITE_META.url }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: SITE_META.author,
        jobTitle: SITE_META.jobTitle,
        worksFor: { '@type': 'Organization', name: SITE_META.employer },
        url: SITE_META.url,
        sameAs: SITE_META.socialProfiles,
        knowsAbout: SITE_META.knowsAbout,
        image: SITE_META.image,
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
