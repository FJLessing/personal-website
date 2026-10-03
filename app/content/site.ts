/**
 * Single source of truth for every string the site renders.
 *
 * Components read from here and never hard-code copy. Changing a sentence must
 * never mean editing a component. Each block is annotated with its interface,
 * so adding a field to a type immediately fails the build until the content is
 * filled in — and vice versa.
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

export interface HeroContent {
  readonly eyebrow: string
  readonly greeting: string
  readonly name: string
  readonly portraitSrc: string
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
  title: 'FJ Lessing - Head of Development | Full-Stack Developer',
  description:
    'FJ Lessing - Head of Development at BRAVE Digital. Expert in full-stack development, mobile apps, cloud architecture, and team leadership. Specialized in React, Vue, Laravel, Flutter, and DevOps.',
  keywords:
    'FJ Lessing, Head of Development, Full-Stack Developer, React, Vue, Laravel, Flutter, AWS, DevOps, Software Engineer, BRAVE Digital',
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
    'Head of Development at BRAVE Digital with expertise in full-stack development, mobile applications, and cloud infrastructure.',
}

export const NAVIGATION: NavigationContent = {
  brandLead: 'FJ',
  brandAccent: 'Lessing',
  homeLabel: 'FJ Lessing - back to top',
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
  portraitSrc: '/profile.png',
  portraitAlt: 'FJ Lessing',
  tagline:
    'I lead a talented team of developers in delivering cutting-edge software solutions. Passionate about full-stack development, mobile applications, and building scalable architectures.',
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
    'As the Head of Development at Brave Digital, I lead a talented team of developers in delivering cutting-edge software solutions for our diverse clientele. My primary responsibilities include scoping and architecting projects, overseeing developer growth and wellbeing, guiding technical strategy, and ensuring that we deliver high-quality products on time and within budget.',
    'I have extensive experience in full-stack development with Laravel, NodeJS, Vue, and React, as well as mobile app development with Flutter, React Native, and Swift. I also manage DevOps, including web servers, cloud infrastructure, and app deployment.',
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
        'Lead a small team of around 5-10 developers in delivering cutting-edge software solutions. Responsible for scoping and architecting projects, overseeing developer growth, guiding technical strategy, and ensuring high-quality delivery. Manage DevOps including web servers, cloud infrastructure, and app deployment. I also fill the gaps in work as a senior developer on projects to help the team hit budgets and deadlines.',
      tech: ['Laravel', 'Node.js', 'Vue', 'React', 'Flutter', 'AWS', 'DevOps'],
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
        'I take on diverse projects outside normal responsibilities to expand skillset and grow professionally. I proactively seek opportunities that challenge learning of new technologies and frameworks. Work with clients from different industries, honing adaptability, communication, and time management skills.',
      tech: [
        'Web Development',
        'Mobile Development',
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
      title: 'Core Skills',
      skills: [
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
      heading: { accent: 'AI agentic', trail: ' Skills & Prompting' },
      span: 'wide',
      paragraphs: [
        "AI has become a core part of life for developers and I've been working on how to best adopt AI and Agentic development to my and my devs processess. I've been building skills with Claude, Gemini and OpenCode and figuring out how to set up agents, both for development and for independent action.",
        "I've been refining the process of providing context through experimentation and learning from the community, and practicing this with personal projects in my homelab and on our internal projects.",
        "I've even been experimenting with AI driven scoping and documentation, AI driven test development and most succesfully AI driven data manipulation and data porting.",
      ],
    },
    {
      heading: { lead: 'Learning ', accent: 'Go' },
      span: 'half',
      paragraphs: [
        "I am currently pursuing learing Go through boot.dev, as an alternative to Dart that has a bit wider application and community support. I love the idea of a fast, cross-platform, strongly typed language where concurrency isn't black magic, and with a decent standard library.",
        "After doing some server applications and microservices, and maybe some TUI's I am planning on trying to tackle Godot and make some small games.",
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
  form: {
    label: 'Contact form',
    fields: [
      {
        name: 'name',
        label: 'Name',
        placeholder: 'Your name',
        type: 'text',
      },
      {
        name: 'email',
        label: 'Email',
        placeholder: 'your@email.com',
        type: 'email',
      },
      {
        name: 'message',
        label: 'Message',
        placeholder: 'Your message',
        type: 'textarea',
      },
    ],
    submitLabel: 'Send Message',
    submittingLabel: 'Sending...',
    successMessage: "✅ Message sent successfully! I'll get back to you soon.",
    errorMessage: '❌ Oops! Something went wrong. Please try again later.',
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
      'The server hit an error handling that request. Try again in a moment — if it keeps happening, get in touch and tell me what you were doing.',
  },
  fallback: {
    title: 'Something went wrong',
    heading: { lead: 'Something ', accent: 'went wrong' },
    message:
      'That request could not be completed. Head back to the home page and try again from there.',
  },
}

export const SKIP_LINK_LABEL = 'Skip to main content'
