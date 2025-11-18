import React from 'react'
import { ExternalLink } from 'lucide-react'
import { TRUSTED_SWAP_DOMAINS } from '@/lib/constants/onboarding'
import { cn } from '@/lib/utils'

export interface SafeExternalLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  allowedDomains?: readonly string[]
  children: React.ReactNode
  showIcon?: boolean
}

/**
 * SafeExternalLink - A secure wrapper for external links
 *
 * This component validates that external links point to trusted domains
 * before allowing navigation. This prevents malicious links from being
 * injected into swap CTAs and other external navigation points.
 *
 * @param href - The URL to link to
 * @param allowedDomains - Array of trusted domains (defaults to TRUSTED_SWAP_DOMAINS)
 * @param children - Link content
 * @param showIcon - Whether to show external link icon (default: true)
 * @param className - Additional CSS classes
 */
export function SafeExternalLink({
  href,
  allowedDomains = TRUSTED_SWAP_DOMAINS,
  children,
  showIcon = true,
  className,
  ...props
}: SafeExternalLinkProps) {
  // Validate the URL
  let isAllowed = false
  let url: URL | null = null

  try {
    url = new URL(href)
    isAllowed = allowedDomains.some((domain) => url!.hostname.endsWith(domain))
  } catch (error) {
    console.error(`Invalid URL provided to SafeExternalLink: ${href}`, error)
    isAllowed = false
  }

  // If domain is not allowed, render as disabled text
  if (!isAllowed) {
    console.warn(
      `Blocked external link to untrusted domain: ${url?.hostname || href}`
    )
    return (
      <span
        className={cn(
          'text-muted-foreground cursor-not-allowed line-through',
          className
        )}
        title="This link has been blocked for security reasons"
      >
        {children}
      </span>
    )
  }

  // Render the safe link
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-primary hover:underline transition-colors',
        className
      )}
      {...props}
    >
      {children}
      {showIcon && <ExternalLink className="h-3 w-3" />}
    </a>
  )
}

/**
 * Helper function to build swap URLs for common DEXes
 */
export const buildSwapUrl = {
  /**
   * Build a QuickSwap swap URL
   */
  quickswap: (params: {
    inputCurrency?: string
    outputCurrency?: string
    amount?: string
  }) => {
    const baseUrl = 'https://quickswap.exchange/#/swap'
    const searchParams = new URLSearchParams()

    if (params.inputCurrency) searchParams.set('inputCurrency', params.inputCurrency)
    if (params.outputCurrency) searchParams.set('outputCurrency', params.outputCurrency)
    if (params.amount) searchParams.set('exactAmount', params.amount)

    const query = searchParams.toString()
    return query ? `${baseUrl}?${query}` : baseUrl
  },

  /**
   * Build a Uniswap swap URL
   */
  uniswap: (params: {
    inputCurrency?: string
    outputCurrency?: string
    chain?: string
  }) => {
    const baseUrl = 'https://app.uniswap.org/swap'
    const searchParams = new URLSearchParams()

    if (params.chain) searchParams.set('chain', params.chain)
    if (params.inputCurrency) searchParams.set('inputCurrency', params.inputCurrency)
    if (params.outputCurrency) searchParams.set('outputCurrency', params.outputCurrency)

    const query = searchParams.toString()
    return query ? `${baseUrl}?${query}` : baseUrl
  },
}
