export const formations = [
  {
    slug: 'administration-linux-twoine',
    title: 'Administration Linux pour hébergement web',
    level: 'Intermédiaire',
    duration: '3 jours',
    format: 'Distanciel live',
    audience: 'Équipes techniques, freelances, administrateurs système',
    objectives: [
      'Comprendre la structure d’un serveur Linux orienté hébergement.',
      'Gérer les services essentiels : Nginx, Node.js, PHP et workers.',
      'Mettre en place une maintenance et une supervision fiables.'
    ],
    highlights: ['Linux server basics', 'Gestion des services', 'Bonnes pratiques de production'],
    description:
      'Formation opérationnelle centrée sur les tâches réellement rencontrées dans un environnement d’hébergement multi-sites.',
  },
  {
    slug: 'securite-web-autohebergement',
    title: 'Sécurité web et auto-hébergement',
    level: 'Avancé',
    duration: '2 jours',
    format: 'Atelier pratique',
    audience: 'DevOps, développeurs full-stack, responsables infra',
    objectives: [
      'Réduire les surfaces d’attaque d’une stack web.',
      'Configurer les protections essentielles (auth, permissions, isolation).',
      'Mettre en place un protocole de réponse en cas d’incident.'
    ],
    highlights: ['Hardening', 'Gestion des accès', 'Plan de remédiation'],
    description:
      'Parcours dédié à la sécurisation des environnements hébergés avec cas concrets et checklists directement réutilisables.',
  },
  {
    slug: 'monitoring-et-performances',
    title: 'Monitoring & optimisation des performances',
    level: 'Intermédiaire',
    duration: '2 jours',
    format: 'Hybride (live + exercices)',
    audience: 'Tech leads et exploitants de plateformes',
    objectives: [
      'Suivre les indicateurs techniques utiles (CPU, RAM, latence, erreurs).',
      'Diagnostiquer les goulots d’étranglement côté backend et base de données.',
      'Définir des seuils d’alerte adaptés au niveau de service attendu.'
    ],
    highlights: ['Observabilité', 'Alerting', 'Optimisation continue'],
    description:
      'Formation orientée résultats pour améliorer stabilité et performance des sites hébergés sur la durée.',
  },
]

export const products = [
  {
    slug: 'audit-technique-hebergement',
    name: 'Audit technique d’hébergement',
    category: 'Service expert',
    delivery: 'Rapport + restitution visio',
    availability: 'Sur demande',
    summary: 'Analyse de l’infrastructure, des services et des risques opérationnels.',
    features: [
      'État des lieux complet des composants critiques',
      'Liste de priorités d’amélioration',
      'Recommandations sécurité et performance'
    ],
  },
  {
    slug: 'accompagnement-migration',
    name: 'Accompagnement migration & mise en production',
    category: 'Accompagnement',
    delivery: 'Suivi projet',
    availability: 'Sur demande',
    summary: 'Support méthodologique et technique pour migrer un site sans interruption.',
    features: [
      'Plan de migration détaillé',
      'Validation pré-production',
      'Assistance au basculement et rollback plan'
    ],
  },
  {
    slug: 'support-exploitation',
    name: 'Support exploitation & fiabilité',
    category: 'Support continu',
    delivery: 'Forfait mensuel',
    availability: 'Ouvert',
    summary: 'Suivi régulier pour maintenir disponibilité, sécurité et qualité de service.',
    features: [
      'Revue proactive des incidents',
      'Conseils d’optimisation continue',
      'Suivi des actions correctives'
    ],
  },
]
