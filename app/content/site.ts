/**
 * Single source of truth for every string the site renders.
 *
 * Components read from here and never hard-code copy. Changing a sentence must
 * never mean editing a component. Each block is annotated with its interface,
 * so adding a field to a type immediately fails the build until the content is
 * filled in, and vice versa.
 */

/** A heading where one run of words is painted in the accent colour. */
export interface AccentHeading {
  readonly lead?: string
  readonly accent: string
  readonly trail?: string
}

/** Names of the icons `AppIcon` knows how to draw. */
export type IconName =
  | 'menu'
  | 'close'
  | 'github'
  | 'linkedin'
  | 'mail'
  | 'phone'
  | 'map-pin'
  | 'coffee'

export interface NavLink {
  readonly label: string
  readonly href: string
}

export interface SocialLink {
  readonly label: string
  readonly href: string
  readonly icon: IconName
}

export interface AboutAside {
  readonly title: string
  readonly lines: readonly string[]
  readonly note?: string
  readonly link?: {
    readonly prefix: string
    readonly label: string
    readonly href: string
  }
}

export interface ExperienceEntry {
  readonly role: string
  readonly company: string
  readonly period: string
  readonly description: string
  readonly tech: readonly string[]
}

export interface SkillCategory {
  readonly title: string
  readonly skills: readonly string[]
}

export interface InterestCard {
  readonly heading: AccentHeading
  readonly paragraphs: readonly string[]
  /** `wide` spans the row; `half` sits two-up from the `md` breakpoint. */
  readonly span: 'wide' | 'half'
}

export interface ContactChannel {
  readonly label: string
  readonly value: string
  readonly href: string
  readonly icon: IconName
  readonly external: boolean
}

export interface ContactField {
  readonly name: 'name' | 'email' | 'message'
  readonly label: string
  readonly placeholder: string
  readonly type: 'text' | 'email' | 'textarea'
  readonly maxLength: number
  /** WCAG 1.3.5: fields about the visitor say what they are. */
  readonly autocomplete?: 'name' | 'email'
}

export interface SiteMeta {
  readonly title: string
  readonly description: string
  readonly keywords: string
  readonly author: string
  readonly siteName: string
  readonly url: string
  readonly image: string
  readonly imageAlt: string
  readonly locale: string
  readonly themeColor: string
  readonly twitterHandle: string
  readonly jobTitle: string
  readonly employer: string
  readonly socialProfiles: readonly string[]
  readonly knowsAbout: readonly string[]
  /** Shorter copy for Open Graph / Twitter, which truncate aggressively. */
  readonly socialDescription: string
}

export interface NavigationContent {
  readonly brandLead: string
  readonly brandAccent: string
  readonly homeLabel: string
  readonly menuLabel: string
  readonly openMenuLabel: string
  readonly closeMenuLabel: string
  readonly links: readonly NavLink[]
}

/**
 * One image in three formats. `fallback` is what every browser can read and
 * what `<img>` points at; the others are offered first and taken if supported.
 * `width`/`height` are the intrinsic pixels of all three, so the browser can
 * reserve the box before any of them arrive.
 */
export interface ResponsiveImage {
  readonly avif: string
  readonly webp: string
  readonly fallback: string
  readonly width: number
  readonly height: number
}

export interface HeroContent {
  readonly eyebrow: string
  readonly greeting: string
  readonly name: string
  readonly portrait: ResponsiveImage
  readonly portraitAlt: string
  readonly tagline: string
  readonly ctaLabel: string
  readonly ctaHref: string
  readonly socials: readonly SocialLink[]
}

export interface AboutContent {
  readonly heading: AccentHeading
  readonly paragraphs: readonly string[]
  readonly asides: readonly AboutAside[]
}

export interface ExperienceContent {
  readonly heading: AccentHeading
  readonly entries: readonly ExperienceEntry[]
}

export interface SkillsContent {
  readonly heading: AccentHeading
  readonly categories: readonly SkillCategory[]
}

export interface InterestsContent {
  readonly heading: AccentHeading
  readonly intro: string
  readonly cards: readonly InterestCard[]
}

export interface ContactContent {
  readonly heading: AccentHeading
  readonly intro: string
  readonly channels: readonly ContactChannel[]
  readonly form: {
    readonly label: string
    readonly fields: readonly ContactField[]
    readonly submitLabel: string
    readonly submittingLabel: string
    readonly successMessage: string
    readonly errorMessage: string
    /** Shown on a 429, so the visitor knows to wait rather than retry. */
    readonly rateLimitedMessage: string
    /** POPIA s18: where the message goes and what it is used for. */
    readonly privacyNote: string
  }
}

export interface FooterContent {
  readonly madeWithPrefix: string
  readonly socials: readonly SocialLink[]
}

/** One flavour of error copy, chosen from the HTTP status. */
export interface ErrorVariant {
  /** Document title. The status code is prefixed at render time. */
  readonly title: string
  readonly heading: AccentHeading
  readonly message: string
}

export interface ErrorContent {
  /** Precedes the status code in the eyebrow, e.g. "Error 404". */
  readonly codePrefix: string
  readonly homeLabel: string
  readonly homeHref: string
  readonly contactLabel: string
  readonly contactHref: string
  /** Heading above the dev-only diagnostics block. Never shown in production. */
  readonly diagnosticsLabel: string
  readonly notFound: ErrorVariant
  readonly serverError: ErrorVariant
  readonly fallback: ErrorVariant
}

export const SITE_META: SiteMeta = {
  title: 'FJ Lessing - Head of Development | Full-Stack & Agentic Development',
  description:
    'FJ Lessing - Head of Development at BRAVE Digital. Leads a development team and the agentic workflows around it. Full-stack, mobile and cloud engineering with React, Vue, Laravel, Flutter and AWS.',
  keywords:
    'FJ Lessing, Head of Development, Agentic Development, AI Agents, AI Integration, Context Engineering, Full-Stack Developer, React, Vue, Laravel, Flutter, AWS, DevOps, Software Engineer, BRAVE Digital',
  author: 'FJ Lessing',
  siteName: 'FJ Lessing Portfolio',
  url: 'https://www.fjlessing.co.za',
  image: 'https://www.fjlessing.co.za/profile.png',
  imageAlt: 'FJ Lessing - Professional Headshot',
  locale: 'en_US',
  themeColor: '#ffc614',
  twitterHandle: '@FJLessing',
  jobTitle: 'Head of Development',
  employer: 'BRAVE Digital',
  socialProfiles: [
    'https://www.linkedin.com/in/fj-lessing/',
    'https://github.com/FJLessing',
  ],
  knowsAbout: [
    'Agentic Development',
    'AI Agents',
    'Context Engineering',
    'Web Development',
    'Mobile Development',
    'React',
    'Vue.js',
    'Laravel',
    'Flutter',
    'AWS',
    'DevOps',
  ],
  socialDescription:
    'Head of Development at BRAVE Digital. Leads a team of developers and the agentic workflows around them, on top of full-stack, mobile and cloud engineering.',
}

export const NAVIGATION: NavigationContent = {
  brandLead: 'FJ',
  brandAccent: 'Lessing',
  /**
   * WCAG 2.5.3 Label in Name: the visible text is `brandLead` and
   * `brandAccent` in adjacent spans, so it reads as `FJLessing`. The
   * accessible name has to start with that exact string or speech input
   * cannot activate the link by what it says.
   */
  homeLabel: 'FJLessing - back to top',
  menuLabel: 'Main navigation',
  openMenuLabel: 'Open menu',
  closeMenuLabel: 'Close menu',
  links: [
    { label: 'About', href: '#about' },
    { label: 'Experience', href: '#experience' },
    { label: 'Skills', href: '#skills' },
    { label: 'Contact', href: '#contact' },
  ],
}

export const HERO: HeroContent = {
  eyebrow: 'Head of Development at BRAVE',
  greeting: "Hi, I'm",
  name: 'FJ Lessing',
  /**
   * 512px square: the box is 224px, 256px from `sm`, so this covers a 2x
   * screen with nothing to spare. `/profile.png` is the untouched master and
   * stays as the Open Graph image, which wants the larger picture.
   */
  portrait: {
    avif: '/profile-512.avif',
    webp: '/profile-512.webp',
    fallback: '/profile-512.png',
    width: 512,
    height: 512,
  },
  portraitAlt: 'FJ Lessing',
  tagline:
    'I lead a team of developers delivering software for startups and corporate clients, and I design how agents and agentic workflows fit that work. Full-stack, mobile and cloud engineering under all of it.',
  ctaLabel: 'Get in Touch',
  ctaHref: '#contact',
  socials: [
    {
      label: 'FJ Lessing on GitHub',
      href: 'https://github.com/FJLessing',
      icon: 'github',
    },
    {
      label: 'FJ Lessing on LinkedIn',
      href: 'https://www.linkedin.com/in/fj-lessing/',
      icon: 'linkedin',
    },
  ],
}

export const ABOUT: AboutContent = {
  heading: { lead: 'About ', accent: 'Me' },
  paragraphs: [
    'As Head of Development at Brave Digital I lead a team of developers delivering software for a diverse client base. I scope and architect projects, guide technical strategy, look after developer growth and wellbeing, and make sure we ship quality work on time and on budget.',
    'A growing part of that job is managing agents as well as developers: deciding where an agent is given work, how it is given context, how far it is trusted to act on its own, and how its output is reviewed before it reaches a client. I build these workflows with Claude, Gemini and OpenCode, prove them out on personal projects in my homelab, and bring into the team only what holds up. So far they have paid off most in AI-driven data manipulation and porting, AI-assisted test development, and scoping and documentation.',
    'All of that sits on full-stack experience with Laravel, Node.js, Vue and React, mobile apps with Flutter, React Native and Swift, and DevOps across web servers, cloud infrastructure and deployment.',
  ],
  asides: [
    {
      title: 'Education',
      lines: ['BIS Multimedia'],
      note: 'University of Pretoria, 2011-2016',
    },
    {
      title: 'Contact',
      lines: ['me@fjlessing.co.za', '+27 83 233 6448'],
    },
    {
      title: 'Code',
      lines: [],
      link: {
        prefix: 'GitHub: ',
        label: 'FJLessing',
        href: 'https://github.com/FJLessing',
      },
    },
  ],
}

export const EXPERIENCE: ExperienceContent = {
  heading: { lead: 'Work ', accent: 'Experience' },
  entries: [
    {
      role: 'Head of Development',
      company: 'Brave Digital',
      period: '2021 - Present',
      description:
        "Lead a team of around 5-10 developers. I set how we adopt AI and agentic development across the team's process: how context is given, how agents are set up, where an agent is trusted to act on its own, and how AI-generated code is reviewed for correctness before it reaches a client. That runs alongside scoping and architecting projects, technical strategy, developer growth and delivery quality. I manage DevOps including web servers, cloud infrastructure and app deployment, and still work as a senior developer on projects to help the team hit budgets and deadlines.",
      tech: [
        'AI Agents',
        'Claude',
        'OpenCode',
        'Laravel',
        'Node.js',
        'Vue',
        'React',
        'Flutter',
        'AWS',
        'DevOps',
      ],
    },
    {
      role: 'Full-Stack Developer',
      company: 'Brave Digital',
      period: '2015 - 2021',
      description:
        'Worked as a full-stack software developer using Laravel, NodeJS, Vue, and React. Developed mobile apps with Flutter, React Native, Cordova, and Swift. Worked on complex software solutions for startups and corporate clients. Developed experimental projects including Unity and VR applications.',
      tech: [
        'Laravel',
        'Node.js',
        'Vue',
        'React',
        'Flutter',
        'React Native',
        'Unity',
        'VR',
      ],
    },
    {
      role: 'Consultant / Developer',
      company: 'Freelance',
      period: '2014 - Present',
      description:
        'Independent work for clients across industries, increasingly AI-led. I review AI-generated code and software for correctness. On the last two platforms I also built a review harness into the codebase using AGENTS.md and Skills, so every pass starts with the context it needs. I have shipped two sites built end to end with AI: an event signup site with galleries, RSVP and user-facing uploads, and a site for a bed and breakfast.',
      tech: [
        'AI Code Review',
        'Agentic Delivery',
        'AGENTS.md',
        'Web Development',
        'Consulting',
        'Full-Stack',
      ],
    },
  ],
}

export const SKILLS: SkillsContent = {
  heading: { lead: 'Skills & ', accent: 'Technologies' },
  categories: [
    {
      title: 'AI & Agentic Engineering',
      skills: [
        'Agentic Development',
        'Agent Design & Orchestration',
        'Context Engineering',
        'Prompt Engineering',
        'Claude Code',
        'OpenCode',
        'Gemini',
        'AntiGravity',
        'MCP',
        'Anthropic API',
        'OpenAI API',
        'Python for AI & Data',
        'AI-Assisted Testing',
        'AI-Driven Data Migration',
      ],
    },
    {
      title: 'Core Skills',
      skills: [
        'AI Integration',
        'Software Engineering',
        'Solution Architecture',
        'Server Architecture',
        'Web Development',
        'Software Development',
        'Mobile App Development',
      ],
    },
    {
      title: 'Languages',
      skills: [
        'HTML',
        'CSS',
        'JavaScript',
        'TypeScript',
        'Dart',
        'Go',
        'PHP',
        'SQL',
        'Python',
        'Java',
        'C#',
      ],
    },
    {
      title: 'Frameworks',
      skills: [
        'Node.js',
        'Laravel',
        'Vue',
        'React',
        'Angular',
        'Flutter',
        'React Native',
        'WordPress',
        'Tailwind',
        'Bootstrap',
        'SASS',
      ],
    },
    {
      title: 'Tools & DevOps',
      skills: [
        'Linux',
        'Git',
        'Docker',
        'AWS',
        'Google Cloud Platform',
        'MySQL',
        'PostgreSQL',
        'Apache',
        'Nginx',
        'Bitbucket Pipelines',
      ],
    },
  ],
}

export const INTERESTS: InterestsContent = {
  heading: { lead: 'Recent ', accent: 'Interests' },
  intro:
    'I love continually developing my knowledge and experimenting with new technologies. This section is updated as I tackle new things and hopefully succeed at some of them.',
  cards: [
    {
      heading: { accent: 'AI agentic', trail: ' orchestration' },
      span: 'wide',
      paragraphs: [
        'The part I keep coming back to is context and control: what an agent needs to know, when it needs to know it, and how far it can run before the quality drops. Most of my experimenting now goes into orchestration, getting several agents to carry a piece of work between them without a person steering every step.',
        "I'm experimenting with building my own orchestration layer, and I use tools like Paperclip to test the idea: agents that pick work off a board, do it, and come back for a decision only when one is actually needed. Alongside that I work with OpenCode, and I run Claude over ACP, so the same agent can sit behind different front ends instead of the whole process being tied to one vendor.",
        'Next is pushing more of the scoping, documentation and review into that loop, and finding out how much of it holds up with me out of the middle.',
      ],
    },
    {
      heading: { lead: 'Small games in ', accent: 'Godot' },
      span: 'half',
      paragraphs: [
        "I'm experimenting with Godot, building small games and seeing how far I can take them. It is the one corner of programming I have never worked in properly, so everything there is new.",
        "That runs next to learning Go through boot.dev, as an alternative to Dart with a bit wider application and community support. I love the idea of a fast, cross-platform, strongly typed language where concurrency isn't black magic, and with a decent standard library. Server applications, microservices and maybe a TUI are the plan there.",
      ],
    },
    {
      heading: {
        lead: 'Electronics and ',
        accent: '3D printing',
        trail: ' experiments',
      },
      span: 'half',
      paragraphs: [
        "I've graduated from my keyboard building hobby into using my 3d printer and electronics to build little products and toys using my 3d printer and CAD.",
        "I've moved from using and customsing other people's models to setting myself the goal of modelling and building my own electronics projects, like a bluetooth speaker, and a small synthesizer.",
      ],
    },
  ],
}

export const CONTACT: ContactContent = {
  heading: { lead: 'Get In ', accent: 'Touch' },
  intro:
    "I'm always interested in hearing about new projects and opportunities. Whether you have a question or just want to say hi, feel free to reach out!",
  channels: [
    {
      label: 'Email',
      value: 'me@fjlessing.co.za',
      href: 'mailto:me@fjlessing.co.za',
      icon: 'mail',
      external: false,
    },
    {
      label: 'Phone',
      value: '+27 83 233 6448',
      href: 'tel:+27832336448',
      icon: 'phone',
      external: false,
    },
    {
      label: 'Website',
      value: 'www.fjlessing.co.za',
      href: 'https://www.fjlessing.co.za',
      icon: 'map-pin',
      external: true,
    },
  ],
  // Lengths match the limits in `server/utils/contact.ts`.
  form: {
    label: 'Contact form',
    fields: [
      {
        name: 'name',
        label: 'Name',
        placeholder: 'Your name',
        type: 'text',
        maxLength: 100,
        autocomplete: 'name',
      },
      {
        name: 'email',
        label: 'Email',
        placeholder: 'your@email.com',
        type: 'email',
        maxLength: 254,
        autocomplete: 'email',
      },
      {
        name: 'message',
        label: 'Message',
        placeholder: 'Your message',
        type: 'textarea',
        maxLength: 5000,
      },
    ],
    submitLabel: 'Send Message',
    submittingLabel: 'Sending...',
    successMessage: "Message sent. I'll get back to you soon.",
    errorMessage:
      'Your message was not sent. Please try again later, or email me directly.',
    rateLimitedMessage:
      'Too many messages just now. Please try again in a few minutes, or email me directly.',
    privacyNote:
      'Your message goes straight to my Slack. I use it to reply to you, nothing else.',
  },
}

export const FOOTER: FooterContent = {
  madeWithPrefix: 'Made with',
  socials: [
    {
      label: 'FJ Lessing on GitHub',
      href: 'https://github.com/FJLessing',
      icon: 'github',
    },
    {
      label: 'FJ Lessing on LinkedIn',
      href: 'https://www.linkedin.com/in/fj-lessing/',
      icon: 'linkedin',
    },
    {
      label: 'Email FJ Lessing',
      href: 'mailto:me@fjlessing.co.za',
      icon: 'mail',
    },
  ],
}

export const ERROR: ErrorContent = {
  codePrefix: 'Error',
  homeLabel: 'Back to the home page',
  homeHref: '/',
  contactLabel: 'Get in Touch',
  contactHref: '/#contact',
  diagnosticsLabel: 'Development diagnostics',
  notFound: {
    title: 'Page not found',
    heading: { lead: 'Page ', accent: 'not found' },
    message:
      'That address does not point at anything on this site. It may have moved, or it may never have existed.',
  },
  serverError: {
    title: 'Server error',
    heading: { lead: 'Something ', accent: 'broke' },
    message:
      'The server hit an error handling that request. Try again in a moment. If it keeps happening, get in touch and tell me what you were doing.',
  },
  fallback: {
    title: 'Something went wrong',
    heading: { lead: 'Something ', accent: 'went wrong' },
    message:
      'That request could not be completed. Head back to the home page and try again from there.',
  },
}

export const SKIP_LINK_LABEL = 'Skip to main content'
