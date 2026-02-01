import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Gitmoji shortcode → emoji map (most common ~80 entries)
const GITMOJI_MAP: Record<string, string> = {
  ':art:': '🎨', ':zap:': '⚡', ':fire:': '🔥', ':bug:': '🐛',
  ':ambulance:': '🚑', ':sparkles:': '✨', ':memo:': '📝', ':rocket:': '🚀',
  ':lipstick:': '💄', ':tada:': '🎉', ':white_check_mark:': '✅', ':lock:': '🔒',
  ':closed_lock_with_key:': '🔐', ':bookmark:': '🔖', ':rotating_light:': '🚨',
  ':construction:': '🚧', ':green_heart:': '💚', ':arrow_down:': '⬇️',
  ':arrow_up:': '⬆️', ':pushpin:': '📌', ':construction_worker:': '👷',
  ':chart_with_upwards_trend:': '📈', ':recycle:': '♻️', ':heavy_plus_sign:': '➕',
  ':heavy_minus_sign:': '➖', ':wrench:': '🔧', ':hammer:': '🔨',
  ':globe_with_meridians:': '🌐', ':pencil2:': '✏️', ':poop:': '💩',
  ':rewind:': '⏪', ':twisted_rightwards_arrows:': '🔀', ':package:': '📦',
  ':alien:': '👽', ':truck:': '🚚', ':page_facing_up:': '📄',
  ':boom:': '💥', ':bento:': '🍱', ':wheelchair:': '♿',
  ':bulb:': '💡', ':beers:': '🍻', ':speech_balloon:': '💬',
  ':card_file_box:': '🗃️', ':loud_sound:': '🔊', ':mute:': '🔇',
  ':busts_in_silhouette:': '👥', ':children_crossing:': '🚸',
  ':building_construction:': '🏗️', ':iphone:': '📱', ':clown_face:': '🤡',
  ':egg:': '🥚', ':see_no_evil:': '🙈', ':camera_flash:': '📸',
  ':alembic:': '⚗️', ':mag:': '🔍', ':label:': '🏷️', ':seedling:': '🌱',
  ':triangular_flag_on_post:': '🚩', ':goal_net:': '🥅', ':dizzy:': '💫',
  ':wastebasket:': '🗑️', ':passport_control:': '🛂', ':adhesive_bandage:': '🩹',
  ':monocle_face:': '🧐', ':coffin:': '⚰️', ':test_tube:': '🧪',
  ':necktie:': '👔', ':stethoscope:': '🩺', ':bricks:': '🧱',
  ':technologist:': '🧑‍💻', ':money_with_wings:': '💸',
  ':thread:': '🧵', ':safety_vest:': '🦺',
}

// URL regex for linkification (FR-083)
const URL_REGEX = /https?:\/\/[^\s<>)"']+/g

/**
 * Linkify URLs in text (FR-083)
 */
function linkifyUrls(text: string): string {
  return text.replace(URL_REGEX, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-retro-blue hover:underline">${url}</a>`
  })
}

/**
 * Replace gitmoji shortcodes with emoji (FR-084)
 */
function replaceGitmoji(text: string): string {
  return text.replace(/:[a-z0-9_]+:/g, (match) => {
    return GITMOJI_MAP[match] || match
  })
}

/**
 * Render commit message with URL linkification, gitmoji, and basic Markdown (FR-083, FR-084, FR-085)
 * Pipeline: gitmoji → markdown → URL linkify → sanitize
 */
export function renderCommitMessage(text: string): string {
  if (!text) return ''

  // Step 1: Replace gitmoji shortcodes
  let result = replaceGitmoji(text)

  // Step 2: Render basic markdown (bold, italic, code)
  result = marked.parseInline(result) as string

  // Step 3: Linkify URLs (after markdown so URLs in markdown links aren't double-processed)
  result = linkifyUrls(result)

  // Step 4: Sanitize HTML
  result = DOMPurify.sanitize(result, {
    ALLOWED_TAGS: ['a', 'strong', 'em', 'code', 'b', 'i', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  })

  return result
}

/**
 * Render full commit message body (multi-line with paragraphs)
 */
export function renderCommitBody(text: string): string {
  if (!text) return ''

  // Step 1: Replace gitmoji shortcodes
  let result = replaceGitmoji(text)

  // Step 2: Render markdown (full block rendering for body)
  result = marked.parse(result) as string

  // Step 3: Linkify remaining URLs
  result = linkifyUrls(result)

  // Step 4: Sanitize HTML
  result = DOMPurify.sanitize(result, {
    ALLOWED_TAGS: ['a', 'strong', 'em', 'code', 'b', 'i', 'br', 'p', 'ul', 'ol', 'li', 'pre', 'blockquote', 'h1', 'h2', 'h3'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  })

  return result
}
