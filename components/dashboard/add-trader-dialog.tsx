'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { Search, Loader2, HelpCircle } from 'lucide-react'
import { useDebounced } from '@/hooks/use-debounced'

interface PolymarketProfile {
  id: string
  name: string | null
  pseudonym: string | null
  bio: string | null
  profileImage: string | null
  proxyWallet: string
  walletActivated: boolean
}

interface AddTraderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AddTraderDialog({ open, onOpenChange, onSuccess }: AddTraderDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<PolymarketProfile[]>([])
  const [selectedTrader, setSelectedTrader] = useState<PolymarketProfile | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)

  // Copy settings
  const [positionSizeType, setPositionSizeType] = useState<string>('PROPORTIONAL')
  const [positionSizeValue, setPositionSizeValue] = useState<string>('1.0')
  const [maxPositionSize, setMaxPositionSize] = useState<string>('')
  const [minTradeSize, setMinTradeSize] = useState<string>('')

  const { toast } = useToast()

  // Debounced search
  const debouncedSearch = useDebounced(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)

    try {
      const response = await fetch(`/api/traders/search?q=${encodeURIComponent(query)}&limit=10`)

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setSearchResults(data.profiles || [])
    } catch (error) {
      console.error('Search error:', error)
      toast({
        variant: 'destructive',
        title: 'Search Failed',
        description: 'Failed to search for traders. Please try again.',
      })
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, 500)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    debouncedSearch(value)
  }

  const handleSelectTrader = (trader: PolymarketProfile) => {
    setSelectedTrader(trader)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleFollow = async () => {
    if (!selectedTrader) return

    // Validate inputs
    const sizeValue = parseFloat(positionSizeValue)
    if (isNaN(sizeValue) || sizeValue <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Input',
        description: 'Position size value must be a positive number.',
      })
      return
    }

    setIsFollowing(true)

    try {
      // Create subscription
      const subscriptionResponse = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: selectedTrader.proxyWallet,
          traderName: selectedTrader.name || selectedTrader.pseudonym,
          traderProfileImage: selectedTrader.profileImage,
        }),
      })

      if (!subscriptionResponse.ok) {
        const errorData = await subscriptionResponse.json().catch(() => ({}))
        console.error('Subscription error:', errorData)
        throw new Error(errorData.error || 'Failed to follow trader')
      }

      // Create copy settings
      const settingsResponse = await fetch('/api/copy-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: selectedTrader.proxyWallet,
          positionSizeType,
          positionSizeValue: sizeValue,
          maxPositionSize: maxPositionSize ? parseFloat(maxPositionSize) : null,
          minTradeSize: minTradeSize ? parseFloat(minTradeSize) : null,
        }),
      })

      if (!settingsResponse.ok) {
        const errorData = await settingsResponse.json().catch(() => ({}))
        console.error('Copy settings error:', errorData)
        throw new Error(errorData.error || 'Failed to save copy settings')
      }

      toast({
        title: 'Success!',
        description: `Now following ${selectedTrader.name || selectedTrader.pseudonym || 'trader'}`,
      })

      // Reset and close
      setSelectedTrader(null)
      setSearchQuery('')
      setPositionSizeType('PROPORTIONAL')
      setPositionSizeValue('1.0')
      setMaxPositionSize('')
      setMinTradeSize('')
      onOpenChange(false)

      // Notify parent to refresh
      onSuccess?.()
    } catch (error) {
      console.error('Follow error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to follow trader. Please try again.'
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      })
    } finally {
      setIsFollowing(false)
    }
  }

  const getDisplayName = (trader: PolymarketProfile) => {
    return trader.name || trader.pseudonym || `${trader.proxyWallet.slice(0, 6)}...${trader.proxyWallet.slice(-4)}`
  }

  const getProfileImage = (trader: PolymarketProfile) => {
    return trader.profileImage || `https://api.dicebear.com/7.x/identicon/svg?seed=${trader.proxyWallet}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Trader to Follow</DialogTitle>
          <DialogDescription>
            Search for a Polymarket trader by name or wallet address
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Search Section */}
          {!selectedTrader && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, username, or wallet address..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Search Results */}
              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Found {searchResults.length} trader(s)
                  </p>
                  <div className="border rounded-md divide-y">
                    {searchResults.map((trader) => (
                      <button
                        key={trader.proxyWallet}
                        onClick={() => handleSelectTrader(trader)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-accent transition-colors text-left"
                      >
                        <img
                          src={getProfileImage(trader)}
                          alt={getDisplayName(trader)}
                          className="w-10 h-10 rounded-full"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {getDisplayName(trader)}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {trader.proxyWallet}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No traders found. Try a different search term.
                </div>
              )}
            </div>
          )}

          {/* Selected Trader & Copy Settings */}
          {selectedTrader && (
            <div className="space-y-6">
              {/* Trader Profile */}
              <div className="border rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <img
                    src={getProfileImage(selectedTrader)}
                    alt={getDisplayName(selectedTrader)}
                    className="w-16 h-16 rounded-full"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{getDisplayName(selectedTrader)}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {selectedTrader.proxyWallet}
                    </p>
                    {selectedTrader.bio && (
                      <p className="text-sm">{selectedTrader.bio}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTrader(null)}
                  >
                    Change
                  </Button>
                </div>
              </div>

              {/* Copy Settings Form */}
              <div className="space-y-4">
                <h4 className="font-medium">Copy Trading Settings</h4>

                <TooltipProvider>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="positionSizeType">Position Size Type</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-2">
                              <p className="font-semibold">Choose how to calculate position sizes:</p>
                              <ul className="space-y-1 text-sm">
                                <li><strong>Proportional:</strong> Scale with trader (e.g., 1.0 = same size, 0.5 = half)</li>
                                <li><strong>Percentage:</strong> Fixed % of your balance per trade</li>
                                <li><strong>Fixed:</strong> Same dollar amount every trade</li>
                              </ul>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Select value={positionSizeType} onValueChange={setPositionSizeType}>
                        <SelectTrigger id="positionSizeType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENTAGE">Percentage of Balance</SelectItem>
                          <SelectItem value="PROPORTIONAL">Proportional to Trader</SelectItem>
                          <SelectItem value="FIXED">Fixed Amount</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="positionSizeValue">
                          {positionSizeType === 'PERCENTAGE' && 'Percentage (%)'}
                          {positionSizeType === 'PROPORTIONAL' && 'Multiplier'}
                          {positionSizeType === 'FIXED' && 'Amount ($)'}
                        </Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-2">
                              {positionSizeType === 'PROPORTIONAL' && (
                                <>
                                  <p className="font-semibold">Multiplier</p>
                                  <ul className="space-y-1 text-sm">
                                    <li>1.0 = Same size as trader</li>
                                    <li>0.5 = Half trader's size</li>
                                    <li>2.0 = Double trader's size</li>
                                  </ul>
                                  <p className="text-sm">Example: Trader invests $1,000 × 0.5 = You invest $500</p>
                                </>
                              )}
                              {positionSizeType === 'PERCENTAGE' && (
                                <>
                                  <p className="font-semibold">Percentage of Your Balance</p>
                                  <p className="text-sm">Invest a fixed % of your total balance on each trade.</p>
                                  <p className="text-sm">Example: 5% of $10,000 = $500 per trade</p>
                                </>
                              )}
                              {positionSizeType === 'FIXED' && (
                                <>
                                  <p className="font-semibold">Fixed Dollar Amount</p>
                                  <p className="text-sm">Invest the same amount on every trade, regardless of trader's size.</p>
                                  <p className="text-sm">Example: $100 per trade</p>
                                </>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="positionSizeValue"
                        type="number"
                        step="0.1"
                        value={positionSizeValue}
                        onChange={(e) => setPositionSizeValue(e.target.value)}
                        placeholder="1.0"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="maxPositionSize">Max Position Size ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-2">
                              <p className="font-semibold">Maximum Investment Per Trade</p>
                              <p className="text-sm">Sets a ceiling on position sizes to limit risk.</p>
                              <p className="text-sm font-semibold">Example:</p>
                              <ul className="space-y-1 text-sm">
                                <li>Max: $500, Trader: $100 → You: $100 ✓</li>
                                <li>Max: $500, Trader: $1,000 → You: $500 (capped) 🛑</li>
                              </ul>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="maxPositionSize"
                        type="number"
                        step="10"
                        value={maxPositionSize}
                        onChange={(e) => setMaxPositionSize(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="minTradeSize">Min Trade Size ($)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-2">
                              <p className="font-semibold">Minimum Investment Per Trade</p>
                              <p className="text-sm">Skip trades smaller than this amount.</p>
                              <p className="text-sm font-semibold">Example:</p>
                              <ul className="space-y-1 text-sm">
                                <li>Min: $50, Trader: $100 → You: $100 ✓</li>
                                <li>Min: $50, Trader: $20 → Skipped ⛔</li>
                              </ul>
                              <p className="text-sm text-muted-foreground">Useful to avoid tiny positions not worth gas fees.</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="minTradeSize"
                        type="number"
                        step="1"
                        value={minTradeSize}
                        onChange={(e) => setMinTradeSize(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </TooltipProvider>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleFollow}
                    disabled={isFollowing}
                    className="flex-1"
                  >
                    {isFollowing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Follow Trader
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedTrader(null)}
                    disabled={isFollowing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
