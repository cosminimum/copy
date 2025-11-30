#!/usr/bin/env python3
"""
Polymarket Copy-Trader Analyzer
===============================
Analyzes trader performance with proper hold-to-maturity handling.
Fixes the "Redemption Trap" where winning positions held to resolution
were not being counted as profits.

Usage:
    python polymarket_analyzer.py                    # Full leaderboard analysis
    python polymarket_analyzer.py 0x123...abc       # Single address analysis

Author: Built for copy-trading strategy development
"""

import requests
import pandas as pd
import numpy as np
import time
import math
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

# ========================= CONFIGURATION =========================

# -------------------- TRADER-SPECIFIC PARAMETERS --------------------
# These parameters are adjustable per-trader analysis.
# Update these frequently when analyzing different traders.

COPY_PORTFOLIO_BALANCE = 150        # Your total portfolio balance for copy trading ($)
MAX_TRADES_LOOKUP = 30000           # Maximum trades to fetch per trader

# -------------------- COPY TRADING STRATEGIES LEGEND --------------------
# Each strategy has a letter code for easy reference. The AI agent should
# implement the copy trading logic based on the strategy description below.
#
# CONSTRAINTS:
#   - Market orders: Minimum $1 per trade
#   - Limit orders: Minimum $0.01 per order
#   - All strategies must respect max_position_pct to limit exposure
#
# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY A: MARKET ORDERS + PROPORTIONAL SIZE
# ═══════════════════════════════════════════════════════════════════════════
# Order Type: MARKET (immediate execution via Polymarket CLOB)
# Sizing: Copy a percentage of the trader's position size
#
# Implementation:
#   1. When trader executes a BUY of X shares at price P:
#      - Calculate copy_size = X * suggested_size_pct
#      - If copy_size * P < $1, round up to $1 minimum or skip
#      - Execute market BUY for copy_size shares
#   2. When trader executes a SELL:
#      - Sell proportional amount of your position (same % as trader sold)
#   3. Position limit: Never exceed max_position_pct of portfolio in one market
#
# Best for: LOW latency risk traders where you have similar capital
# ══════════════════════════════════���════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY B: MARKET ORDERS + FIXED SIZE
# ═══════════════════════════════════════════════════════════════════════════
# Order Type: MARKET (immediate execution via Polymarket CLOB)
# Sizing: Always trade a fixed dollar amount per signal
#
# Implementation:
#   1. When trader executes a BUY at price P:
#      - Calculate shares = suggested_size / P
#      - Execute market BUY for 'shares' amount
#   2. When trader executes a SELL:
#      - If you have a position, sell MIN(your_position, shares_bought_originally)
#   3. Position limit: Never exceed max_position_pct of portfolio in one market
#
# Best for: LOW latency risk traders with large trade sizes relative to your portfolio
# ══��════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY C: LIMIT ORDERS + PROPORTIONAL SIZE
# ════════════════════════════════════════════════════���══════════════════════
# Order Type: LIMIT (passive maker order via Polymarket CLOB)
# Sizing: Copy a percentage of the trader's position size
#
# Implementation:
#   1. When trader executes a BUY of X shares at price P:
#      - Calculate copy_size = X * suggested_size_pct
#      - Place LIMIT BUY order at price P (or P - 0.01 for better entry)
#      - Set order expiry to 5 minutes (cancel if not filled)
#   2. When trader executes a SELL:
#      - Place LIMIT SELL for proportional amount at price P (or P + 0.01)
#   3. Accept that many orders will NOT fill - this is expected
#   4. Position limit: Never exceed max_position_pct of portfolio in one market
#
# Best for: HIGH latency risk traders (scalpers/arb bots) - avoids chasing
# ═══════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY D: LIMIT ORDERS + FIXED SIZE
# ═══════════════════════════════════════════════════════════════════════════
# Order Type: LIMIT (passive maker order via Polymarket CLOB)
# Sizing: Always trade a fixed dollar amount per signal
#
# Implementation:
#   1. When trader executes a BUY at price P:
#      - Calculate shares = suggested_size / P
#      - Place LIMIT BUY order at price P (or P - 0.01 for better entry)
#      - Set order expiry to 5 minutes (cancel if not filled)
#   2. When trader executes a SELL:
#      - Place LIMIT SELL for your position at price P (or P + 0.01)
#   3. Accept that many orders will NOT fill - this is expected
#   4. Position limit: Never exceed max_position_pct of portfolio in one market
#
# Best for: HIGH latency risk traders with large trade sizes
# ═══════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY E: ADAPTIVE (HYBRID MARKET + LIMIT)
# ═══════════════════════════════════════════════════════════════════════════
# Order Type: DYNAMIC - switches between MARKET and LIMIT based on conditions
# Sizing: Uses the sizing method determined by capital analysis
#
# Implementation:
#   1. Track time since trader's last trade (trade_gap)
#   2. When trader executes a trade:
#      - If trade_gap > 60 seconds: Use MARKET order (trader is slow/deliberate)
#      - If trade_gap <= 60 seconds: Use LIMIT order (trader is rapid/scalping)
#   3. For LIMIT orders:
#      - Place at trader's price or slightly better
#      - Set 5 minute expiry
#   4. For MARKET orders:
#      - Execute immediately
#   5. Position limit: Never exceed max_position_pct of portfolio in one market
#
# Best for: MEDIUM latency risk traders with mixed trading patterns
# ═══════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY F: LIMIT ORDERS + IMPROVED ENTRY
# ═══════════════════════════════════════════════════════════════════════════
# Order Type: LIMIT (passive maker with price improvement)
# Sizing: Fixed or proportional based on capital analysis
#
# Implementation:
#   1. When trader executes a BUY at price P:
#      - Place LIMIT BUY at price (P - 0.02) for better entry
#      - This gives you a 2 cent better price if filled
#      - Set order expiry to 10 minutes
#   2. When trader executes a SELL at price P:
#      - Place LIMIT SELL at price (P + 0.02) for better exit
#   3. Lower fill rate but better prices when filled
#   4. Position limit: Never exceed max_position_pct of portfolio in one market
#
# Best for: Patient copying where you want better prices than the trader got
# ═══════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY G: COMPOUNDING REWARDS
# ═══════════════════════════════════════════════════════════════════════════
# Order Type: MARKET or LIMIT (based on latency risk)
# Sizing: DYNAMIC - adjusts based on accumulated profits from this trader
#
# Core Concept:
#   Your position size grows as you accumulate profits from copying this trader.
#   Start conservative, then compound gains to accelerate returns while
#   protecting against drawdowns.
#
# Parameters:
#   - base_size: Starting position size (e.g., $5 or 3% of portfolio)
#   - reinvestment_rate: % of profits to add to trading capital (e.g., 50%)
#   - profit_tier_increment: Profit threshold to increase size tier (e.g., $20)
#   - size_increase_per_tier: How much to increase per tier (e.g., +25%)
#   - max_size_multiplier: Cap on how large positions can grow (e.g., 4x)
#   - drawdown_protection: Reduce size if cumulative P&L drops below peak (e.g., -20% = halve size)
#
# Implementation:
#   1. Initialize per-trader tracking:
#      - cumulative_pnl = 0 (total profit/loss from copying this trader)
#      - peak_pnl = 0 (highest cumulative P&L reached)
#      - current_tier = 0 (starts at base tier)
#      - effective_capital = base_size
#
#   2. After each closed trade, update cumulative_pnl:
#      - cumulative_pnl += trade_profit_or_loss
#      - peak_pnl = max(peak_pnl, cumulative_pnl)
#
#   3. Calculate current tier and effective size:
#      - If cumulative_pnl > 0:
#          current_tier = floor(cumulative_pnl / profit_tier_increment)
#          size_multiplier = min(1 + (current_tier * size_increase_per_tier), max_size_multiplier)
#          effective_capital = base_size + (cumulative_pnl * reinvestment_rate)
#          position_size = effective_capital * size_multiplier
#      - If cumulative_pnl <= 0:
#          position_size = base_size (back to conservative)
#
#   4. Drawdown protection:
#      - drawdown_pct = (peak_pnl - cumulative_pnl) / peak_pnl if peak_pnl > 0
#      - If drawdown_pct > 0.20: position_size *= 0.5 (halve size)
#      - If drawdown_pct > 0.40: position_size = base_size (reset to base)
#      - If drawdown_pct > 0.60: PAUSE copying (trader may have lost edge)
#
#   5. When trader executes a trade:
#      - Calculate position_size using above rules
#      - Use MARKET or LIMIT based on trader's latency_risk:
#          LOW latency risk -> MARKET orders
#          MEDIUM/HIGH latency risk -> LIMIT orders
#      - Execute trade with calculated position_size
#
#   6. Position limit: Never exceed max_position_pct of ORIGINAL portfolio
#      (compounding applies to sizing, not risk limits)
#
# Example progression (base_size=$10, reinvest=50%, tier=$20, increase=25%):
#   Start:         $10 position size
#   After +$20:    $10 + ($20 * 0.5) = $20 capital, tier 1 = $20 * 1.25 = $25 size
#   After +$40:    $10 + ($40 * 0.5) = $30 capital, tier 2 = $30 * 1.50 = $45 size
#   After +$60:    $10 + ($60 * 0.5) = $40 capital, tier 3 = $40 * 1.75 = $70 size
#   After +$80:    $10 + ($80 * 0.5) = $50 capital, tier 4 = $50 * 2.00 = $100 size
#   (capped at max_size_multiplier)
#
# Best for: Traders with CONSISTENT win rates (>60%) where you want to
#           let profits compound while protecting against losing streaks.
#           Works especially well with high win rate / lower ROI traders.
# ═══════════════════════════════════════════════════════════════════════════

# -------------------- GENERAL THRESHOLDS --------------------
# These parameters define quality standards and are rarely changed.
# They apply globally to filter and evaluate all traders.

# Minimum requirements (filtering)
MIN_TRADES = 10                    # Minimum trades for statistical significance
MIN_WIN_RATE = 0.50                # 52% win rate minimum
MIN_MARKETS = 3                    # Must trade multiple markets (no one-hit wonders)
MAX_AVG_TRADE_SIZE = 5000          # Filter out whales
MAX_AVG_BUY_PRICE = 0.98           # Filter scalpers buying at 95c+
MIN_ROI = 0.05                     # Minimum 5% ROI
MIN_SCORE = 5                      # Minimum composite score
RECENCY_HALF_LIFE_DAYS = 30        # How quickly old activity loses weight

# Verdict thresholds (for copy-trade recommendation)
VERDICT_STRONG_MIN_SCORE = 40      # Minimum score for STRONG verdict
VERDICT_STRONG_MIN_WIN_RATE = 0.55 # Minimum win rate for STRONG verdict
VERDICT_STRONG_MIN_SHARPE = 0.0    # Minimum Sharpe for STRONG verdict (must be positive)
VERDICT_MODERATE_MIN_SCORE = 25    # Minimum score for MODERATE verdict
VERDICT_MODERATE_MIN_WIN_RATE = 0.52  # Minimum win rate for MODERATE verdict

# -------------------- API SETTINGS --------------------
POLYMARKET_DATA_API = "https://data-api.polymarket.com"
POLYMARKET_CLOB_API = "https://clob.polymarket.com"
POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

REQUEST_TIMEOUT = 15
SLEEP_BETWEEN_REQUESTS = 0.3
MAX_RETRIES = 3

# Cache for market resolutions (avoids repeated API calls)
_resolution_cache: Dict[str, Optional[str]] = {}


# ========================= API HELPERS =========================

def api_get(url: str, params: Dict = None, retries: int = MAX_RETRIES) -> Optional:
    """
    Robust API getter with exponential backoff and error handling.
    Returns None on failure to allow graceful degradation.
    """
    for attempt in range(retries):
        try:
            response = requests.get(
                url,
                params=params,
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT
            )

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                # Rate limited - exponential backoff
                wait = 2 ** (attempt + 1)
                print(f"      Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            elif response.status_code == 404:
                # Common for new wallets or old markets
                return None
            else:
                if attempt == retries - 1:
                    print(f"      API error {response.status_code}: {url[:60]}...")
                time.sleep(1)

        except requests.exceptions.Timeout:
            if attempt == retries - 1:
                print(f"      Timeout: {url[:60]}...")
            time.sleep(2)
        except requests.exceptions.RequestException as e:
            if attempt == retries - 1:
                print(f"      Request failed: {str(e)[:50]}")
            time.sleep(1)

    return None


def fetch_market_resolution(condition_id: str, asset_id: str = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Fetch market resolution status. This is THE critical function for
    fixing the "Redemption Trap" - properly crediting hold-to-maturity wins.

    For multi-outcome markets (sports betting), we need to check if the specific
    asset/token the trader holds is the winning one.

    Returns:
        Tuple of (resolution_status, winning_asset_id)
        resolution_status: 'RESOLVED', 'UNRESOLVED', or None
        winning_asset_id: The asset ID that won (if resolved), or None
    """
    if not condition_id or condition_id == 'unknown':
        return None, None

    # Check cache first
    cache_key = condition_id
    if cache_key in _resolution_cache:
        return _resolution_cache[cache_key]

    # Method 1: CLOB API with condition_id (most reliable for resolution + multi-outcome)
    data = api_get(f"{POLYMARKET_CLOB_API}/markets/{condition_id}")
    if data:
        # Check if market is closed/resolved
        is_closed = data.get('closed', False) or data.get('active') == False

        if is_closed:
            # Find the winning token
            tokens = data.get('tokens', [])
            for token in tokens:
                if token.get('winner'):
                    winning_asset = token.get('token_id') or token.get('asset_id')
                    _resolution_cache[cache_key] = ('RESOLVED', winning_asset)
                    return 'RESOLVED', winning_asset

            # Market closed but no winner found (might be voided or still processing)
            _resolution_cache[cache_key] = ('RESOLVED', None)
            return 'RESOLVED', None
        else:
            _resolution_cache[cache_key] = ('UNRESOLVED', None)
            return 'UNRESOLVED', None

    # Method 2: Gamma API with condition_id search
    data = api_get(f"{POLYMARKET_GAMMA_API}/markets", {'condition_id': condition_id})
    if data and isinstance(data, list) and len(data) > 0:
        market = data[0]
        resolved = market.get('resolved', False)
        if resolved:
            # For binary markets
            outcome = market.get('outcome') or market.get('resolutionOutcome')
            if outcome is not None:
                # Return the outcome as the "winning asset" for binary markets
                _resolution_cache[cache_key] = ('RESOLVED', str(outcome).upper())
                return 'RESOLVED', str(outcome).upper()
        else:
            _resolution_cache[cache_key] = ('UNRESOLVED', None)
            return 'UNRESOLVED', None

    # Method 3: Try Gamma API events endpoint
    data = api_get(f"{POLYMARKET_GAMMA_API}/events", {'slug': condition_id})
    if data and isinstance(data, list) and len(data) > 0:
        event = data[0]
        markets = event.get('markets', [])
        for market in markets:
            if market.get('resolved'):
                outcome = market.get('outcome')
                _resolution_cache[cache_key] = ('RESOLVED', str(outcome).upper() if outcome else None)
                return 'RESOLVED', str(outcome).upper() if outcome else None
        _resolution_cache[cache_key] = ('UNRESOLVED', None)
        return 'UNRESOLVED', None

    # Could not determine - cache as None to avoid repeated API calls
    _resolution_cache[cache_key] = (None, None)
    return None, None


# ========================= CANDIDATE SOURCING =========================

def fetch_top_traders(limit: int = 50) -> List[Dict]:
    """
    Fetch candidates from leaderboard with fallback to recent trades.
    No authentication needed - leaderboard is public.
    """
    print(f"Fetching top {limit} candidates from leaderboard...")
    candidates = {}

    # Primary: Leaderboard API (multiple time windows for diversity)
    for window in ['week', 'month', 'all']:
        data = api_get(
            f"{POLYMARKET_DATA_API}/leaderboard",
            {'window': window, 'limit': limit}
        )

        if data and isinstance(data, list):
            for entry in data:
                addr = (entry.get('user') or entry.get('address', '')).lower()
                if addr and addr not in candidates:
                    candidates[addr] = {
                        'address': addr,
                        'leaderboard_pnl': float(entry.get('pnl', 0)),
                        'leaderboard_volume': float(entry.get('volume', 0)),
                        'source': f'leaderboard_{window}'
                    }
        time.sleep(0.3)

    # Fallback: If leaderboard returned nothing, mine recent trades
    if not candidates:
        print("  Leaderboard empty, falling back to recent trades...")
        candidates = _fallback_candidates_from_trades(limit)

    result = list(candidates.values())
    print(f"  Found {len(result)} unique candidates")
    return result


def _fallback_candidates_from_trades(limit: int) -> Dict[str, Dict]:
    """
    Extract active traders from recent trade activity.
    Used when leaderboard API fails or returns empty.
    """
    candidates = {}

    # Fetch recent trades
    data = api_get(f"{POLYMARKET_DATA_API}/trades", {'limit': 1000})

    if not data:
        return candidates

    # Aggregate volume per user
    user_stats = defaultdict(lambda: {'volume': 0.0, 'trade_count': 0})

    for trade in data:
        addr = (
            trade.get('user') or
            trade.get('maker') or
            trade.get('taker', '')
        ).lower()

        if not addr:
            continue

        try:
            size = float(trade.get('size', 0))
            price = float(trade.get('price', 0))
            user_stats[addr]['volume'] += size * price
            user_stats[addr]['trade_count'] += 1
        except (ValueError, TypeError):
            continue

    # Sort by volume and take top N
    sorted_users = sorted(
        user_stats.items(),
        key=lambda x: x[1]['volume'],
        reverse=True
    )[:limit]

    for addr, stats in sorted_users:
        candidates[addr] = {
            'address': addr,
            'leaderboard_pnl': 0,  # Unknown from trades alone
            'leaderboard_volume': stats['volume'],
            'source': 'recent_trades_fallback'
        }

    return candidates


def fetch_trade_history(address: str, limit: int = 500, verbose: bool = False) -> List[Dict]:
    """
    Fetch complete trade history with pagination.

    Note: Polymarket API may have pagination limits. We fetch in batches
    and stop when we get fewer results than requested or hit the limit.
    """
    all_trades = []
    offset = 0
    batch_num = 0

    while len(all_trades) < limit:
        batch_size = min(100, limit - len(all_trades))
        data = api_get(
            f"{POLYMARKET_DATA_API}/trades",
            {'user': address, 'limit': batch_size, 'offset': offset}
        )

        if not data:
            if verbose:
                print(f"      Batch {batch_num}: No data returned (offset={offset})")
            break

        batch_num += 1
        all_trades.extend(data)

        # Show progress: first 3 batches detailed, then every 10th batch
        if verbose:
            if batch_num <= 3:
                print(f"      Batch {batch_num}: Got {len(data)} trades (total: {len(all_trades)})")
            elif batch_num % 10 == 0:
                print(f"      Batch {batch_num}: {len(all_trades)} trades fetched...")

        if len(data) < batch_size:
            if verbose:
                print(f"      Batch {batch_num}: Got {len(data)} < {batch_size} requested, done.")
            break

        offset += len(data)
        time.sleep(0.1)

    return all_trades


# ========================= TRADE NORMALIZATION =========================

def normalize_trade(raw: Dict) -> Optional[Dict]:
    """
    Normalize trade data from various API response formats.
    Returns None if trade is invalid.
    """
    try:
        # Timestamp handling (various formats)
        ts_val = raw.get('timestamp') or raw.get('time') or raw.get('createdAt')
        if isinstance(ts_val, str):
            ts = datetime.fromisoformat(ts_val.replace('Z', '+00:00')).timestamp()
        else:
            ts = float(ts_val)

        # Core fields
        size = float(raw.get('size', 0))
        price = float(raw.get('price', 0))

        # Validation
        if size <= 0 or price <= 0 or price > 1:
            return None

        side = raw.get('side', '').upper()
        if side not in ['BUY', 'SELL']:
            return None

        # Market identifier (Polymarket uses various field names)
        market = (
            raw.get('market') or
            raw.get('conditionId') or
            raw.get('condition_id') or
            raw.get('marketId')
        )

        # Asset/outcome identifier (token ID for multi-outcome, or YES/NO for binary)
        asset = raw.get('asset') or raw.get('asset_id') or raw.get('assetId') or raw.get('outcome')

        return {
            'timestamp': ts,
            'market': str(market) if market else 'unknown',
            'asset': str(asset) if asset else 'unknown',
            'side': side,
            'size': size,
            'price': price
        }
    except (ValueError, TypeError, KeyError):
        return None


# ========================= PNL CALCULATION =========================

def _determine_token_type(asset_id: str) -> str:
    """
    Determine if an asset is a YES or NO token.

    Polymarket uses different conventions:
    - Sometimes 'YES'/'NO' directly in outcome field
    - Sometimes token IDs where we need to infer from context
    - Asset IDs ending in specific patterns

    Returns 'YES', 'NO', or 'UNKNOWN'
    """
    if not asset_id or asset_id == 'unknown':
        return 'UNKNOWN'

    asset_upper = str(asset_id).upper()

    # Direct outcome labels
    if asset_upper in ['YES', 'TRUE', '1']:
        return 'YES'
    if asset_upper in ['NO', 'FALSE', '0']:
        return 'NO'

    # Some Polymarket asset IDs encode outcome in the ID
    # This is a heuristic - in practice, the API often returns 'YES'/'NO' directly
    return 'UNKNOWN'


def calculate_fifo_pnl_with_resolution(
    trades_df: pd.DataFrame,
    verbose: bool = False
) -> Tuple[Dict[str, Dict], Dict, List[Dict]]:
    """
    FIFO P&L calculation that properly handles hold-to-maturity AND
    correctly distinguishes between YES and NO token positions.

    The key insight: If a trader holds shares when a market resolves,
    those shares pay out $1 (if correct outcome) or $0 (if wrong).

    CRITICAL: We must track YES and NO positions separately because:
    - YES tokens pay $1 if market resolves YES, $0 if NO
    - NO tokens pay $1 if market resolves NO, $0 if YES

    Returns:
        market_results: Dict of per-market P&L data
        resolution_stats: Summary of how markets resolved
        current_positions: List of currently held positions
    """
    market_results = {}
    current_positions = []
    resolution_stats = {
        'resolved_won': 0,      # Held correct outcome
        'resolved_lost': 0,     # Held wrong outcome
        'unresolved': 0,
        'unknown': 0
    }

    # Group by (market, asset) to handle YES and NO tokens separately
    groups = list(trades_df.groupby(['market', 'asset']))
    total_groups = len(groups)
    resolution_checks_done = 0

    if verbose:
        print(f"    Processing {total_groups} market/asset positions...")

    for idx, ((market_id, asset_id), group) in enumerate(groups):
        trades = group.sort_values('timestamp')
        token_type = _determine_token_type(asset_id)

        # FIFO queue: [(shares, cost_per_share), ...]
        position_queue = []
        realized_pnl = 0.0
        total_volume = 0.0

        for _, trade in trades.iterrows():
            size = trade['size']
            price = trade['price']
            total_volume += size * price

            if trade['side'] == 'BUY':
                position_queue.append((size, price))

            else:  # SELL
                sell_remaining = size
                sell_revenue = size * price
                sell_cost = 0.0

                while sell_remaining > 0 and position_queue:
                    lot_size, lot_price = position_queue[0]

                    if lot_size <= sell_remaining:
                        # Close entire lot
                        sell_cost += lot_size * lot_price
                        sell_remaining -= lot_size
                        position_queue.pop(0)
                    else:
                        # Partial close
                        sell_cost += sell_remaining * lot_price
                        position_queue[0] = (lot_size - sell_remaining, lot_price)
                        sell_remaining = 0

                realized_pnl += sell_revenue - sell_cost

        # Current position (shares still held)
        remaining_shares = sum(lot[0] for lot in position_queue)
        remaining_cost = sum(lot[0] * lot[1] for lot in position_queue)

        # THE CRITICAL FIX: Handle hold-to-maturity with proper YES/NO logic
        unrealized_pnl = 0.0
        position_status = 'open'

        if remaining_shares > 0.01:  # Non-trivial position held
            resolution_checks_done += 1
            # Show progress during slow resolution lookups
            if verbose and (resolution_checks_done <= 3 or resolution_checks_done % 10 == 0):
                print(f"    Checking resolution {resolution_checks_done}/{total_groups}...")

            resolution_status, winning_asset = fetch_market_resolution(market_id, asset_id)

            if resolution_status == 'RESOLVED':
                # Determine if this position won or lost
                position_won = False

                if winning_asset:
                    # For multi-outcome markets: compare asset_id to winning token_id
                    # Both are long numeric strings representing the token
                    if str(asset_id) == str(winning_asset):
                        position_won = True
                    # For binary markets: winning_asset might be 'YES'/'NO'
                    elif token_type == 'YES' and str(winning_asset).upper() in ['YES', '1', 'TRUE']:
                        position_won = True
                    elif token_type == 'NO' and str(winning_asset).upper() in ['NO', '0', 'FALSE']:
                        position_won = True

                if position_won:
                    # Winning tokens pay out $1 each
                    unrealized_pnl = remaining_shares * 1.0 - remaining_cost
                    position_status = 'won'
                    resolution_stats['resolved_won'] += 1
                else:
                    # Losing tokens are worth $0
                    unrealized_pnl = 0 - remaining_cost
                    position_status = 'lost'
                    resolution_stats['resolved_lost'] += 1

            elif resolution_status == 'UNRESOLVED':
                # Market still open - use last trade price as estimate
                last_price = trades.iloc[-1]['price']
                unrealized_pnl = remaining_shares * last_price - remaining_cost
                position_status = 'open'
                resolution_stats['unresolved'] += 1

            else:
                # Couldn't determine resolution
                last_price = trades.iloc[-1]['price']
                unrealized_pnl = remaining_shares * last_price - remaining_cost
                position_status = 'unknown'
                resolution_stats['unknown'] += 1

            if verbose:
                token_label = f"[{token_type}]" if token_type != 'UNKNOWN' else ""
                print(f"      Market {market_id[:12]}...{token_label} | "
                      f"{remaining_shares:.1f} shares @ ${remaining_cost/remaining_shares:.2f} avg | "
                      f"Resolution: {resolution_status} | Status: {position_status}")

            # Add to current positions if still open
            if position_status == 'open':
                current_positions.append({
                    'market': market_id,
                    'asset': asset_id,
                    'token_type': token_type,
                    'size': remaining_shares,
                    'avg_price': remaining_cost / remaining_shares if remaining_shares > 0 else 0,
                    'current_value': unrealized_pnl + remaining_cost,
                    'last_trade_ts': trades.iloc[-1]['timestamp']
                })

        # Use composite key for market results to handle both YES and NO positions
        result_key = f"{market_id}:{asset_id}"
        market_results[result_key] = {
            'market': market_id,
            'asset': asset_id,
            'token_type': token_type,
            'realized_pnl': realized_pnl,
            'unrealized_pnl': unrealized_pnl,
            'total_pnl': realized_pnl + unrealized_pnl,
            'position': remaining_shares,
            'position_cost': remaining_cost,
            'position_status': position_status,
            'volume': total_volume,
            'trade_count': len(trades)
        }

    return market_results, resolution_stats, current_positions


# ========================= TRADER ANALYSIS =========================

def analyze_trader(
    address: str,
    trades: List[Dict],
    verbose: bool = False
) -> Optional[Dict]:
    """
    Comprehensive trader analysis with proper hold-to-maturity handling.
    Returns None if trader doesn't meet minimum criteria.
    """
    # Normalize trades
    normalized = [normalize_trade(t) for t in trades]
    normalized = [t for t in normalized if t is not None]

    if len(normalized) < MIN_TRADES:
        if verbose:
            print(f"   Filtered: Only {len(normalized)} valid trades (min: {MIN_TRADES})")
        return None

    df = pd.DataFrame(normalized)

    # Market diversity check
    unique_markets = df['market'].nunique()
    if unique_markets < MIN_MARKETS:
        if verbose:
            print(f"   Filtered: Only {unique_markets} markets (min: {MIN_MARKETS})")
        return None

    # Basic filters before expensive P&L calculation
    buys = df[df['side'] == 'BUY']
    avg_buy_price = buys['price'].mean() if not buys.empty else 1.0

    if avg_buy_price > MAX_AVG_BUY_PRICE:
        if verbose:
            print(f"   Filtered: Avg buy price ${avg_buy_price:.2f} > ${MAX_AVG_BUY_PRICE} (scalper)")
        return None

    trade_values = df['size'] * df['price']
    avg_trade_size = trade_values.mean()

    if avg_trade_size > MAX_AVG_TRADE_SIZE:
        if verbose:
            print(f"   Filtered: Avg trade ${avg_trade_size:.0f} > ${MAX_AVG_TRADE_SIZE} (whale)")
        return None

    # Calculate capital deployed (sum of all buy costs)
    capital_deployed = (buys['size'] * buys['price']).sum()

    if capital_deployed <= 0:
        if verbose:
            print(f"   Filtered: No capital deployed")
        return None

    # Calculate unique positions (market + asset combinations)
    unique_positions = df.groupby(['market', 'asset']).ngroups

    # Calculate P&L with resolution handling
    if verbose:
        print(f"   Unique markets (condition IDs): {unique_markets}")
        print(f"   Unique positions (market+token pairs): {unique_positions}")
        print(f"   Calculating P&L across {unique_positions} positions...")

    market_pnl, resolution_stats, current_positions = calculate_fifo_pnl_with_resolution(df, verbose=verbose)

    # Win rate calculation
    profitable_markets = sum(1 for m in market_pnl.values() if m['total_pnl'] > 0)
    losing_markets = sum(1 for m in market_pnl.values() if m['total_pnl'] < 0)
    total_decided = profitable_markets + losing_markets

    if total_decided == 0:
        if verbose:
            print(f"   Filtered: No closed positions to evaluate")
        return None

    win_rate = profitable_markets / total_decided

    if win_rate < MIN_WIN_RATE:
        if verbose:
            print(f"   Filtered: Win rate {win_rate:.1%} < {MIN_WIN_RATE:.1%}")
        return None

    # Aggregate P&L
    total_pnl = sum(m['total_pnl'] for m in market_pnl.values())
    total_volume = sum(m['volume'] for m in market_pnl.values())

    # ROI calculation (based on actual capital deployed)
    roi = total_pnl / capital_deployed if capital_deployed > 0 else 0

    # ROI filter with win rate adjustment
    # High win rate traders (>70%) are valuable even with lower ROI
    # They may be trading small amounts or using conservative sizing
    effective_min_roi = MIN_ROI
    if win_rate >= 0.90:
        effective_min_roi = 0.0  # 90%+ win rate = no ROI minimum (even break-even is fine)
    elif win_rate >= 0.80:
        effective_min_roi = MIN_ROI * 0.25  # 80%+ win rate = 25% of normal ROI requirement
    elif win_rate >= 0.70:
        effective_min_roi = MIN_ROI * 0.5  # 70%+ win rate = 50% of normal ROI requirement

    if roi < effective_min_roi:
        if verbose:
            print(f"   Filtered: ROI {roi:.1%} < {effective_min_roi:.1%} (adjusted for {win_rate:.0%} win rate)")
        return None

    # Sharpe ratio (risk-adjusted returns)
    market_returns = [m['total_pnl'] for m in market_pnl.values() if m['trade_count'] > 0]

    if len(market_returns) > 1:
        avg_return = np.mean(market_returns)
        std_return = np.std(market_returns)
        sharpe = avg_return / std_return if std_return > 0 else 0
    else:
        sharpe = 0

    # Time analysis
    first_ts = df['timestamp'].min()
    last_ts = df['timestamp'].max()
    active_days = max((last_ts - first_ts) / 86400, 1)
    days_since_active = (time.time() - last_ts) / 86400

    # Recency factor (exponential decay)
    recency = max(math.exp(-0.693 * days_since_active / RECENCY_HALF_LIFE_DAYS), 0.05)

    # Latency dependency analysis
    # Traders with rapid-fire trades are harder to copy (by the time you detect
    # and send tx, the opportunity may be gone)
    sorted_timestamps = df['timestamp'].sort_values().values
    if len(sorted_timestamps) > 1:
        time_gaps = np.diff(sorted_timestamps)  # Time between consecutive trades (seconds)
        median_gap_seconds = float(np.median(time_gaps))
        rapid_trades = int(np.sum(time_gaps < 60))  # Trades within 60 seconds
        rapid_trade_pct = rapid_trades / len(time_gaps) if len(time_gaps) > 0 else 0
        very_rapid_trades = int(np.sum(time_gaps < 10))  # Trades within 10 seconds
        very_rapid_pct = very_rapid_trades / len(time_gaps) if len(time_gaps) > 0 else 0
    else:
        median_gap_seconds = 86400.0  # Default to 1 day if only 1 trade
        rapid_trade_pct = 0.0
        very_rapid_pct = 0.0

    # Latency risk classification
    # HIGH: >30% trades within 60s or >10% within 10s - likely scalper/arb bot
    # MEDIUM: >10% trades within 60s - some time-sensitive trading
    # LOW: <10% rapid trades - suitable for copy trading
    if very_rapid_pct > 0.10 or rapid_trade_pct > 0.30:
        latency_risk = 'HIGH'
    elif rapid_trade_pct > 0.10:
        latency_risk = 'MEDIUM'
    else:
        latency_risk = 'LOW'

    # Annualized ROI (capped at 2000%)
    if roi > 0 and active_days >= 7:
        annualized_roi = min(((1 + roi) ** (365 / active_days) - 1), 20)
    else:
        annualized_roi = roi

    # Trade size metrics
    median_trade = trade_values.median()

    # Composite score
    # Weights: ROI matters, but consistency (Sharpe) and win rate are crucial for copy trading
    score = (
        min(roi * 100, 200) * 0.25 +              # ROI contribution (capped)
        win_rate * 100 * 0.25 +                    # Win rate
        max(sharpe, -2) * 15 * 0.20 +             # Sharpe (allow negative but cap)
        math.log10(len(df) + 1) * 15 * 0.15 +    # Activity (diminishing returns)
        (100 / (median_trade + 50)) * 20 * 0.15   # Followability (smaller = better)
    ) * recency

    if score < MIN_SCORE:
        if verbose:
            print(f"   Filtered: Score {score:.1f} < {MIN_SCORE}")
        return None

    return {
        'address': address,
        'score': round(score, 2),
        'roi_pct': round(roi * 100, 2),
        'annualized_roi_pct': round(annualized_roi * 100, 1),
        'win_rate': round(win_rate, 3),
        'sharpe': round(sharpe, 3),
        'total_pnl': round(total_pnl, 2),
        'capital_deployed': round(capital_deployed, 2),
        'volume': round(total_volume, 2),
        'trades': len(df),
        'markets': unique_markets,
        'profitable_markets': profitable_markets,
        'losing_markets': losing_markets,
        'avg_buy_price': round(avg_buy_price, 3),
        'median_trade': round(median_trade, 2),
        'avg_trade': round(avg_trade_size, 2),
        'active_days': round(active_days, 1),
        'days_inactive': round(days_since_active, 1),
        'recency': round(recency, 3),
        'resolution_stats': resolution_stats,
        'current_positions': current_positions,
        # Latency dependency metrics
        'latency_risk': latency_risk,
        'median_trade_gap_seconds': round(median_gap_seconds, 1),
        'rapid_trade_pct': round(rapid_trade_pct * 100, 1),  # % of trades within 60s
        'very_rapid_trade_pct': round(very_rapid_pct * 100, 1)  # % of trades within 10s
    }


# ========================= COPY TRADING STRATEGY RECOMMENDATION =========================

def recommend_copy_strategy(metrics: Dict, portfolio_balance: float = COPY_PORTFOLIO_BALANCE) -> Dict:
    """
    Analyze trader behavior and recommend optimal copy trading strategy.

    Considers:
    - Latency risk (HIGH traders need limit orders)
    - Trade size (small trades = fixed amount, large = percentage)
    - Win rate and Sharpe (higher = more aggressive sizing)
    - Portfolio balance constraints ($1 min for market, $0.01 for limit)
    - Whether compounding strategy is suitable (high win rate traders)

    Returns strategy recommendation with parameters.
    """
    latency_risk = metrics.get('latency_risk', 'LOW')
    avg_trade = metrics.get('avg_trade', 50)
    median_trade = metrics.get('median_trade', 50)
    win_rate = metrics.get('win_rate', 0.5)
    sharpe = metrics.get('sharpe', 0)
    roi_pct = metrics.get('roi_pct', 0)
    trades_count = metrics.get('trades', 0)

    # Initialize recommendation
    rec = {
        'primary_strategy': None,
        'order_type': None,  # 'market' or 'limit'
        'sizing_method': None,
        'suggested_size': 0,
        'max_position_pct': 0,  # Max % of portfolio per position
        'reasons': [],
        'warnings': [],
        'expected_trades_per_day': 0,
        'expected_capital_usage': 0,
    }

    # Step 1: Determine order type based on latency risk
    if latency_risk == 'HIGH':
        rec['order_type'] = 'limit'
        rec['reasons'].append("HIGH latency risk - use limit orders to avoid chasing prices")
        rec['warnings'].append("Many trades may not fill - expect lower trade frequency")
    elif latency_risk == 'MEDIUM':
        rec['order_type'] = 'hybrid'
        rec['reasons'].append("MEDIUM latency risk - use limit orders for rapid trades, market for slower ones")
    else:
        rec['order_type'] = 'market'
        rec['reasons'].append("LOW latency risk - market orders are viable")

    # Step 2: Determine sizing method based on trader's behavior
    trader_capital = metrics.get('capital_deployed', 1000)
    our_vs_trader_ratio = portfolio_balance / trader_capital if trader_capital > 0 else 0.01

    # Calculate what 1% of our portfolio would be
    one_pct_portfolio = portfolio_balance * 0.01

    # If trader's avg trade is very large compared to our portfolio, use fixed amount
    # CHANGED: Relaxed threshold from 0.1 (10%) to 0.4 (40%) to allow proportional copying more often
    if avg_trade > portfolio_balance * 0.4:  
        rec['sizing_method'] = 'fixed_amount'
        
        # CHANGED: More aggressive sizing for high win rates
        # Old: 0.02 + (win_rate - 0.5) * 0.06  (Max ~5%)
        # New: 0.05 + (win_rate - 0.5) * 0.4   (At 60% WR -> 9%, at 70% WR -> 13%)
        base_pct = 0.05
        if win_rate > 0.5:
            size_pct = base_pct + (win_rate - 0.5) * 0.4
        else:
            size_pct = base_pct
            
        rec['suggested_size'] = max(1.0, portfolio_balance * size_pct)  # Min $1 for market orders
        rec['reasons'].append(f"Trader avg trade (${avg_trade:.0f}) > 40% of your portfolio - use fixed sizing")

    # If we're a similar size to trader, use percentage of trade
    elif our_vs_trader_ratio > 0.5 and our_vs_trader_ratio < 2.0:
        rec['sizing_method'] = 'pct_of_trade'
        rec['suggested_size'] = min(1.0, our_vs_trader_ratio)  # 100% max
        rec['reasons'].append(f"Similar capital to trader - copy {rec['suggested_size']*100:.0f}% of each trade")

    # If trader is much larger, use percentage of their trade
    elif our_vs_trader_ratio < 0.5:
        rec['sizing_method'] = 'pct_of_trade'
        rec['suggested_size'] = our_vs_trader_ratio  # Copy proportionally
        
        # CHECK: If proportional copy results in dust (<$2), switch to fixed
        est_trade_val = avg_trade * rec['suggested_size']
        if est_trade_val < 2.0:
             rec['sizing_method'] = 'fixed_amount'
             # Use aggressive fixed sizing logic
             base_pct = 0.05
             if win_rate > 0.5:
                size_pct = base_pct + (win_rate - 0.5) * 0.4
             else:
                size_pct = base_pct
             rec['suggested_size'] = max(2.0, portfolio_balance * size_pct)
             rec['reasons'].append(f"Proportional copy would be too small (${est_trade_val:.2f}) - using fixed size")
        else:
             rec['reasons'].append(f"Trader has {1/our_vs_trader_ratio:.1f}x your capital - scale down proportionally")

    # If we're much larger than trader, use fixed amount per trade
    else:
        rec['sizing_method'] = 'fixed_amount'
        # Match trader's avg trade size
        rec['suggested_size'] = min(avg_trade, portfolio_balance * 0.05)  # Cap at 5% of portfolio
        rec['reasons'].append(f"You have more capital than trader - match their trade sizes")

    # Step 3: Adjust for order type minimums
    if rec['order_type'] == 'limit':
        # Limit orders have $0.01 minimum
        if rec['sizing_method'] == 'fixed_amount' and rec['suggested_size'] < 0.01:
            rec['suggested_size'] = 0.01
        rec['reasons'].append("Limit orders allow smaller sizes ($0.01 min)")
    else:
        # Market orders have $1 minimum
        if rec['sizing_method'] == 'fixed_amount' and rec['suggested_size'] < 1.0:
            rec['suggested_size'] = 1.0
            rec['warnings'].append("Minimum $1 per market order - may over-expose on small trades")

    # Step 4: Set max position as % of portfolio based on risk metrics
    # CHANGED: Increased caps for high conviction traders
    if sharpe > 1.0 and win_rate > 0.6:
        rec['max_position_pct'] = 25.0  # Very High confidence
        rec['reasons'].append("Elite metrics - allow up to 25% per position")
    elif win_rate > 0.7:
         rec['max_position_pct'] = 30.0 # High win rate specialist
         rec['reasons'].append("Win rate > 70% - allow up to 30% per position")
    elif sharpe > 0.5 and win_rate > 0.55:
        rec['max_position_pct'] = 15.0
    elif sharpe > 0 and win_rate > 0.52:
        rec['max_position_pct'] = 10.0
    else:
        rec['max_position_pct'] = 5.0
        rec['warnings'].append("Conservative sizing due to modest risk metrics")

    # Step 5: Estimate trading frequency and capital usage
    active_days = metrics.get('active_days', 30)
    if active_days > 0:
        trades_per_day = trades_count / active_days
        rec['expected_trades_per_day'] = round(trades_per_day, 1)

        if rec['sizing_method'] == 'fixed_amount':
            daily_capital = trades_per_day * rec['suggested_size']
        else:
            daily_capital = trades_per_day * avg_trade * rec['suggested_size']

        rec['expected_capital_usage'] = round(daily_capital, 2)

        # Warn if daily usage exceeds portfolio
        if daily_capital > portfolio_balance * 0.5:
            rec['warnings'].append(f"High daily capital usage (${daily_capital:.0f}) - consider reducing size")

    # Step 6: Set primary strategy name
    if rec['order_type'] == 'limit' and rec['sizing_method'] == 'fixed_amount':
        rec['primary_strategy'] = 'limit_fixed'
    elif rec['order_type'] == 'limit' and rec['sizing_method'] == 'pct_of_trade':
        rec['primary_strategy'] = 'limit_proportional'
    elif rec['order_type'] == 'market' and rec['sizing_method'] == 'fixed_amount':
        rec['primary_strategy'] = 'market_fixed'
    elif rec['order_type'] == 'market' and rec['sizing_method'] == 'pct_of_trade':
        rec['primary_strategy'] = 'market_proportional'
    elif rec['order_type'] == 'hybrid':
        rec['primary_strategy'] = 'adaptive'
        rec['reasons'].append("Use market orders when gap > 60s, limit orders otherwise")

    # Step 7: Check if COMPOUNDING strategy (G) is recommended
    # Compounding works best for high win rate traders with consistent performance
    # This is an ALTERNATIVE/OVERLAY strategy that can be combined with the primary
    rec['compounding_recommended'] = False
    rec['compounding_params'] = {}

    if win_rate >= 0.60 and sharpe > 0:
        rec['compounding_recommended'] = True

        # Calculate compounding parameters based on trader consistency
        # Higher win rate = more aggressive compounding
        if win_rate >= 0.75:
            # Elite trader - aggressive compounding
            base_size_pct = 0.05  # 5% of portfolio as base
            reinvestment_rate = 0.60  # Reinvest 60% of profits
            tier_increment = 15.0  # $15 profit per tier
            size_increase = 0.30  # +30% per tier
            max_multiplier = 5.0  # Up to 5x base size
        elif win_rate >= 0.65:
            # Strong trader - moderate compounding
            base_size_pct = 0.04  # 4% of portfolio as base
            reinvestment_rate = 0.50  # Reinvest 50% of profits
            tier_increment = 20.0  # $20 profit per tier
            size_increase = 0.25  # +25% per tier
            max_multiplier = 4.0  # Up to 4x base size
        else:
            # Good trader - conservative compounding
            base_size_pct = 0.03  # 3% of portfolio as base
            reinvestment_rate = 0.40  # Reinvest 40% of profits
            tier_increment = 25.0  # $25 profit per tier
            size_increase = 0.20  # +20% per tier
            max_multiplier = 3.0  # Up to 3x base size

        base_size = portfolio_balance * base_size_pct

        rec['compounding_params'] = {
            'base_size': round(base_size, 2),
            'reinvestment_rate': reinvestment_rate,
            'profit_tier_increment': tier_increment,
            'size_increase_per_tier': size_increase,
            'max_size_multiplier': max_multiplier,
            'drawdown_halve_threshold': 0.20,  # Halve size at 20% drawdown
            'drawdown_reset_threshold': 0.40,  # Reset to base at 40% drawdown
            'drawdown_pause_threshold': 0.60,  # Pause copying at 60% drawdown
        }

        rec['reasons'].append(f"COMPOUNDING (G) recommended: {win_rate:.0%} win rate + positive Sharpe = consistent trader")
        rec['reasons'].append(f"  Start: ${base_size:.2f}, compound {reinvestment_rate:.0%} of profits, up to {max_multiplier:.0f}x max")

    return rec


def print_strategy_recommendation(rec: Dict, portfolio_balance: float):
    """Print the copy trading strategy recommendation."""
    print(f"\n--- COPY TRADING STRATEGY (Portfolio: ${portfolio_balance:,.0f}) ---")

    # Strategy mapping to letter codes (see STRATEGIES LEGEND at top of file)
    # A = Market + Proportional, B = Market + Fixed, C = Limit + Proportional,
    # D = Limit + Fixed, E = Adaptive (Hybrid), F = Limit + Improved Entry, G = Compounding
    strategy_codes = {
        'market_proportional': ('A', 'MARKET ORDERS + PROPORTIONAL SIZE'),
        'market_fixed': ('B', 'MARKET ORDERS + FIXED SIZE'),
        'limit_proportional': ('C', 'LIMIT ORDERS + PROPORTIONAL SIZE'),
        'limit_fixed': ('D', 'LIMIT ORDERS + FIXED SIZE'),
        'adaptive': ('E', 'ADAPTIVE (HYBRID MARKET + LIMIT)'),
    }

    code, name = strategy_codes.get(rec['primary_strategy'], ('?', rec['primary_strategy']))
    print(f"{'Recommended Strategy:':<25} {code}. {name}")
    print(f"{'Order Type:':<25} {rec['order_type'].upper()}")
    print(f"{'Sizing Method:':<25} {rec['sizing_method']}")

    if rec['sizing_method'] == 'fixed_amount':
        print(f"{'Suggested Size:':<25} ${rec['suggested_size']:.2f} per trade")
    else:
        print(f"{'Suggested Size:':<25} {rec['suggested_size']*100:.1f}% of trader's position")

    print(f"{'Max Position:':<25} {rec['max_position_pct']:.1f}% of portfolio (${portfolio_balance * rec['max_position_pct']/100:.2f})")
    print(f"{'Est. Trades/Day:':<25} {rec['expected_trades_per_day']:.1f}")
    print(f"{'Est. Daily Capital:':<25} ${rec['expected_capital_usage']:.2f}")

    # Show compounding strategy if recommended
    if rec.get('compounding_recommended', False):
        params = rec.get('compounding_params', {})
        print(f"\n--- COMPOUNDING STRATEGY (G) - RECOMMENDED ---")
        print(f"{'Base Size:':<25} ${params.get('base_size', 0):.2f}")
        print(f"{'Reinvestment Rate:':<25} {params.get('reinvestment_rate', 0)*100:.0f}%")
        print(f"{'Tier Increment:':<25} ${params.get('profit_tier_increment', 0):.0f} profit per tier")
        print(f"{'Size Increase/Tier:':<25} +{params.get('size_increase_per_tier', 0)*100:.0f}%")
        print(f"{'Max Multiplier:':<25} {params.get('max_size_multiplier', 1):.0f}x base size")
        print(f"\nDrawdown Protection:")
        print(f"  - 20% drawdown: Halve position size")
        print(f"  - 40% drawdown: Reset to base size")
        print(f"  - 60% drawdown: PAUSE copying this trader")

    if rec['reasons']:
        print(f"\nRationale:")
        for reason in rec['reasons']:
            print(f"  + {reason}")

    if rec['warnings']:
        print(f"\nWarnings:")
        for warning in rec['warnings']:
            print(f"  ! {warning}")


# ========================= OUTPUT FORMATTING =========================

def print_trader_detail(metrics: Dict):
    """Print detailed analysis for single trader mode."""
    print("\n" + "=" * 70)
    print(f"TRADER ANALYSIS: {metrics['address']}")
    print("=" * 70)

    print(f"\n--- Performance ---")
    print(f"{'ROI:':<25} {metrics['roi_pct']:+.2f}%")
    print(f"{'Annualized ROI:':<25} {metrics['annualized_roi_pct']:+.1f}%")
    print(f"{'Total P&L:':<25} ${metrics['total_pnl']:,.2f}")
    print(f"{'Capital Deployed:':<25} ${metrics['capital_deployed']:,.2f}")
    print(f"{'Volume Traded:':<25} ${metrics['volume']:,.2f}")

    print(f"\n--- Consistency ---")
    print(f"{'Win Rate:':<25} {metrics['win_rate']:.1%}")
    print(f"{'Sharpe Ratio:':<25} {metrics['sharpe']:.3f}")
    print(f"{'Markets Won:':<25} {metrics['profitable_markets']}")
    print(f"{'Markets Lost:':<25} {metrics['losing_markets']}")

    print(f"\n--- Activity ---")
    print(f"{'Total Trades:':<25} {metrics['trades']}")
    print(f"{'Markets Traded:':<25} {metrics['markets']}")
    print(f"{'Active Days:':<25} {metrics['active_days']:.0f}")
    print(f"{'Days Since Last Trade:':<25} {metrics['days_inactive']:.1f}")
    print(f"{'Recency Factor:':<25} {metrics['recency']:.3f}")

    print(f"\n--- Followability ---")
    print(f"{'Avg Buy Price:':<25} ${metrics['avg_buy_price']:.3f}")
    print(f"{'Median Trade Size:':<25} ${metrics['median_trade']:.2f}")
    print(f"{'Avg Trade Size:':<25} ${metrics['avg_trade']:.2f}")

    # Latency dependency section
    print(f"\n--- Latency Dependency ---")
    latency_risk = metrics.get('latency_risk', 'UNKNOWN')
    median_gap = metrics.get('median_trade_gap_seconds', 0)
    rapid_pct = metrics.get('rapid_trade_pct', 0)
    very_rapid_pct = metrics.get('very_rapid_trade_pct', 0)

    # Format median gap nicely
    if median_gap >= 86400:
        gap_str = f"{median_gap/86400:.1f} days"
    elif median_gap >= 3600:
        gap_str = f"{median_gap/3600:.1f} hours"
    elif median_gap >= 60:
        gap_str = f"{median_gap/60:.1f} minutes"
    else:
        gap_str = f"{median_gap:.0f} seconds"

    print(f"{'Latency Risk:':<25} {latency_risk}")
    print(f"{'Median Trade Gap:':<25} {gap_str}")
    print(f"{'Rapid Trades (<60s):':<25} {rapid_pct:.1f}%")
    print(f"{'Very Rapid (<10s):':<25} {very_rapid_pct:.1f}%")

    if latency_risk == 'HIGH':
        print("  WARNING: High-frequency trader - difficult to copy effectively")
    elif latency_risk == 'MEDIUM':
        print("  CAUTION: Some time-sensitive trades - may miss some opportunities")

    res = metrics['resolution_stats']
    print(f"\n--- Market Resolution Stats ---")
    print(f"{'Positions Won:':<25} {res['resolved_won']}")
    print(f"{'Positions Lost:':<25} {res['resolved_lost']}")
    print(f"{'Still Open:':<25} {res['unresolved']}")
    print(f"{'Unknown:':<25} {res['unknown']}")

    # Show current open positions if any
    positions = metrics.get('current_positions', [])
    if positions:
        print(f"\n--- Current Open Positions ({len(positions)}) ---")
        for pos in positions[:5]:  # Show top 5
            token_label = f"[{pos['token_type']}]" if pos['token_type'] != 'UNKNOWN' else ""
            print(f"  {pos['market'][:20]}...{token_label} | "
                  f"{pos['size']:.1f} @ ${pos['avg_price']:.3f}")

    # Summary block for easy copy-paste
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"{'Address:':<25} {metrics['address']}")
    print(f"{'Composite Score:':<25} {metrics['score']:.1f}")
    print(f"{'ROI:':<25} {metrics['roi_pct']:+.2f}%")
    print(f"{'Win Rate:':<25} {metrics['win_rate']:.1%}")
    print(f"{'Sharpe:':<25} {metrics['sharpe']:.3f}")
    print(f"{'Latency Risk:':<25} {metrics['latency_risk']}")

    # Copy-trade recommendation (using configurable thresholds)
    if (metrics['score'] >= VERDICT_STRONG_MIN_SCORE and
        metrics['win_rate'] >= VERDICT_STRONG_MIN_WIN_RATE and
        metrics['sharpe'] > VERDICT_STRONG_MIN_SHARPE):
        print(f"\nVERDICT: STRONG candidate for copy trading")
        print("  - High score, good win rate, positive risk-adjusted returns")
    elif (metrics['score'] >= VERDICT_MODERATE_MIN_SCORE and
          metrics['win_rate'] >= VERDICT_MODERATE_MIN_WIN_RATE):
        print(f"\nVERDICT: MODERATE candidate - monitor before copying")
        print("  - Decent metrics but needs more observation")
    else:
        print("VERDICT: NOT RECOMMENDED for copy trading")
        print("  - Does not meet minimum criteria for reliable copying")

    print("=" * 70)

    # Generate and print copy trading strategy recommendation
    strategy_rec = recommend_copy_strategy(metrics, COPY_PORTFOLIO_BALANCE)
    print_strategy_recommendation(strategy_rec, COPY_PORTFOLIO_BALANCE)


def print_leaderboard(results: List[Dict]):
    """Print ranked leaderboard with key metrics."""
    print("\n" + "=" * 145)
    print("TOP TRADERS FOR COPY-TRADING (Hold-to-Maturity Adjusted)")
    print("=" * 145)

    header = (
        f"{'#':<3} {'Score':<7} {'ROI%':<8} {'WinRate':<8} {'Sharpe':<8} "
        f"{'P&L':<11} {'Capital':<10} {'Trades':<6} {'Mkts':<5} {'AvgBuy':<7} Address"
    )
    print(header)
    print("-" * 145)

    for i, t in enumerate(results[:25], 1):
        # Format large numbers nicely
        pnl = t['total_pnl']
        pnl_str = f"${pnl:,.0f}" if abs(pnl) < 100000 else f"${pnl/1000:,.0f}k"

        cap = t['capital_deployed']
        cap_str = f"${cap:,.0f}" if cap < 100000 else f"${cap/1000:,.0f}k"

        print(
            f"{i:<3} {t['score']:<7.1f} {t['roi_pct']:<+8.1f} {t['win_rate']:<8.1%} "
            f"{t['sharpe']:<+8.3f} {pnl_str:<11} {cap_str:<10} {t['trades']:<6} "
            f"{t['markets']:<5} ${t['avg_buy_price']:<6.2f} {t['address']}"
        )


# ========================= MAIN FUNCTIONS =========================

def analyze_single_address(address: str):
    """Analyze a single address in detail."""
    print(f"\nAnalyzing address: {address}")
    print("-" * 50)

    print("Fetching trade history...")
    trades = fetch_trade_history(address.lower(), limit=MAX_TRADES_LOOKUP, verbose=True)

    if not trades:
        print(f"\nNo trades found for {address}")
        print("\nPossible reasons:")
        print("  - The address has no Polymarket trading activity")
        print("  - The address format is incorrect (should be 0x...)")
        print("  - API temporarily unavailable")
        return None

    print(f"Found {len(trades)} trades (API may limit historical data)")

    print("\nRunning analysis (this may take a moment for resolution lookups)...")
    metrics = analyze_trader(address.lower(), trades, verbose=True)

    if metrics:
        print_trader_detail(metrics)
        return metrics
    else:
        print("\n" + "=" * 50)
        print(f"Trader {address} did not pass minimum filters.")
        print("\nCurrent thresholds:")
        print(f"  - MIN_TRADES: {MIN_TRADES}")
        print(f"  - MIN_WIN_RATE: {MIN_WIN_RATE:.0%}")
        print(f"  - MIN_ROI: {MIN_ROI:.0%}")
        print(f"  - MIN_MARKETS: {MIN_MARKETS}")
        print(f"  - MAX_AVG_BUY_PRICE: ${MAX_AVG_BUY_PRICE}")
        print(f"  - MAX_AVG_TRADE_SIZE: ${MAX_AVG_TRADE_SIZE}")
        print("\nYou can adjust these in the CONFIG section if needed.")
        print("=" * 50)
        return None


def run_leaderboard_analysis(limit: int = 60):
    """Run full leaderboard analysis."""
    print("=" * 80)
    print("POLYMARKET COPY-TRADER ANALYZER")
    print("With Hold-to-Maturity Resolution Handling")
    print(f"Run: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

    candidates = fetch_top_traders(limit=limit)

    if not candidates:
        print("\nNo candidates found.")
        print("Please check your internet connection and try again.")
        return

    print(f"\nAnalyzing {len(candidates)} candidates...")
    print("(This may take several minutes due to market resolution lookups)\n")

    results = []
    filtered_count = 0
    no_data_count = 0

    for i, candidate in enumerate(candidates, 1):
        addr = candidate['address']
        print(f"[{i:3d}/{len(candidates)}] {addr[:12]}...", end=" ", flush=True)

        trades = fetch_trade_history(addr)

        if not trades:
            print("no trades")
            no_data_count += 1
            time.sleep(SLEEP_BETWEEN_REQUESTS)
            continue

        metrics = analyze_trader(addr, trades, verbose=False)

        if metrics:
            results.append(metrics)
            print(
                f"SCORE {metrics['score']:6.1f} | "
                f"ROI {metrics['roi_pct']:+6.1f}% | "
                f"WR {metrics['win_rate']:.0%} | "
                f"Sharpe {metrics['sharpe']:+.2f}"
            )
        else:
            print("filtered")
            filtered_count += 1

        time.sleep(SLEEP_BETWEEN_REQUESTS)

    # Sort by score
    results.sort(key=lambda x: x['score'], reverse=True)

    # Display leaderboard
    print_leaderboard(results)

    # Export to CSV
    if results:
        filename = f"copy_traders_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"

        # Flatten resolution_stats and remove current_positions for CSV export
        export_data = []
        for r in results:
            row = r.copy()
            stats = row.pop('resolution_stats', {})
            row.pop('current_positions', None)  # Remove nested list for CSV
            row['res_won'] = stats.get('resolved_won', 0)
            row['res_lost'] = stats.get('resolved_lost', 0)
            row['res_open'] = stats.get('unresolved', 0)
            row['res_unknown'] = stats.get('unknown', 0)
            export_data.append(row)

        pd.DataFrame(export_data).to_csv(filename, index=False)
        print(f"\nExported {len(results)} traders to {filename}")

        # Export Current Portfolio Signals
        print("\nGenerating Current Portfolio Signals...")
        signals = []
        top_traders = results[:10]  # Top 10 traders only for signals

        for trader in top_traders:
            for pos in trader.get('current_positions', []):
                signals.append({
                    'trader_address': trader['address'],
                    'trader_score': trader['score'],
                    'trader_win_rate': trader['win_rate'],
                    'market_id': pos['market'],
                    'token_type': pos['token_type'],
                    'size': round(pos['size'], 2),
                    'avg_entry_price': round(pos['avg_price'], 3),
                    'est_current_value': round(pos['current_value'], 2),
                    'last_trade_date': datetime.fromtimestamp(pos['last_trade_ts']).strftime('%Y-%m-%d %H:%M'),
                    'link': f"https://polymarket.com/event/{pos['market']}"
                })

        if signals:
            signals_filename = f"current_portfolio_signals_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
            pd.DataFrame(signals).to_csv(signals_filename, index=False)
            print(f"Exported {len(signals)} active positions to {signals_filename}")
            print("  -> Use this file to see what top traders are currently holding!")
        else:
            print("No active positions found among top traders.")

    # Summary
    print(f"\n{'='*50}")
    print("SUMMARY")
    print(f"{'='*50}")
    print(f"Candidates analyzed:  {len(candidates)}")
    print(f"Passed all filters:   {len(results)}")
    print(f"Filtered out:         {filtered_count}")
    print(f"No trade data:        {no_data_count}")
    print(f"Resolution cache:     {len(_resolution_cache)} markets")
    print(f"{'='*50}")


def main():
    """Main entry point with CLI argument handling."""
    print("\n" + "=" * 60)
    print("  POLYMARKET COPY-TRADER ANALYZER")
    print("=" * 60)

    if len(sys.argv) > 1:
        # Single address mode
        address = sys.argv[1].strip()

        # Basic validation
        if not address.startswith('0x'):
            print(f"\nError: Invalid address format")
            print(f"Got: {address}")
            print("Expected: 0x followed by 40 hex characters")
            print("\nExample: python polymarket_analyzer.py 0x1234567890abcdef1234567890abcdef12345678")
            sys.exit(1)

        if len(address) != 42:
            print(f"\nError: Address wrong length ({len(address)} chars, expected 42)")
            print("Ethereum addresses are 42 characters: '0x' + 40 hex digits")
            sys.exit(1)

        analyze_single_address(address)

    else:
        # Full leaderboard mode
        print("\nUsage:")
        print("  python polymarket_analyzer.py                  # Analyze top traders")
        print("  python polymarket_analyzer.py 0x123...abc     # Analyze single address")
        print("")

        run_leaderboard_analysis(limit=60)


if __name__ == "__main__":
    main()
