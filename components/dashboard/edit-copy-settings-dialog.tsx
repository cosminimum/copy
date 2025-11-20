'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { Loader2, HelpCircle } from 'lucide-react'

interface CopySetting {
  id: string
  positionSizeType: string
  positionSizeValue: number
  maxPositionSize: number | null
  minTradeSize: number | null
}

interface EditCopySettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  traderWalletAddress: string
  traderName: string
  onSuccess?: () => void
}

export function EditCopySettingsDialog({
  open,
  onOpenChange,
  traderWalletAddress,
  traderName,
  onSuccess,
}: EditCopySettingsDialogProps) {
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [positionSizeType, setPositionSizeType] = useState<string>('PROPORTIONAL')
  const [positionSizeValue, setPositionSizeValue] = useState<string>('1.0')
  const [maxPositionSize, setMaxPositionSize] = useState<string>('')
  const [minTradeSize, setMinTradeSize] = useState<string>('')

  const { toast } = useToast()

  // Fetch existing settings when dialog opens
  useEffect(() => {
    if (open && traderWalletAddress) {
      fetchSettings()
    }
  }, [open, traderWalletAddress])

  const fetchSettings = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/copy-settings?traderAddress=${encodeURIComponent(traderWalletAddress)}&isGlobal=false`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch settings')
      }

      const data = await response.json()

      if (data.settings) {
        const settings: CopySetting = data.settings
        setPositionSizeType(settings.positionSizeType)
        setPositionSizeValue(settings.positionSizeValue.toString())
        setMaxPositionSize(settings.maxPositionSize?.toString() || '')
        setMinTradeSize(settings.minTradeSize?.toString() || '')
      } else {
        // No settings found, use defaults
        setPositionSizeType('PROPORTIONAL')
        setPositionSizeValue('1.0')
        setMaxPositionSize('')
        setMinTradeSize('')
      }
    } catch (error) {
      console.error('Error fetching copy settings:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load copy settings. Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
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

    setIsSaving(true)

    try {
      const settingsResponse = await fetch('/api/copy-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: traderWalletAddress,
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
        description: `Updated copy settings for ${traderName}`,
      })

      // Invalidate all relevant queries to refresh the entire dashboard
      queryClient.invalidateQueries({ queryKey: ['following'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['trades'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Save error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings. Please try again.'
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Copy Settings</DialogTitle>
          <DialogDescription>
            Update copy trading settings for {traderName}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
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
                            <li>Max: $500, Trader: $1,000 → You: $500 (capped)</li>
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
                            <li>Min: $50, Trader: $20 → Skipped</li>
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
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
