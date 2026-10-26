# Climatrix: Route Recommendation Algorithm & Worked Example

## 1. Algorithm Overview

The recommendation engine prioritizes **driver safety first and travel efficiency second**. Unlike traditional consumer navigation systems that optimize purely for shortest travel time, Climatrix uses a lexicographic ranking algorithm with deterministic tie tolerances and strict load-sensitive safety constraints.

### 2. Lexicographic Priority Key

Each route $R$ is assigned a ranking tuple:
$$\text{key}(R) = (\text{has\_no\_travel},\, \text{no\_travel\_miles},\, \text{severe\_miles},\, \text{high\_miles},\, \text{avg\_risk},\, \text{duration\_min})$$

1. **Safety Filter (`has_no_travel`)**:
   - Any route containing even a single `NO_TRAVEL` checkpoint is flagged as **not drivable**.
   - Not-drivable routes are immediately disqualified from recommendation (though still returned and displayed on the UI with visual warnings).
   - If **all** routes contain `NO_TRAVEL` conditions, the engine recommends `null` and explicitly advises the driver to delay departure until weather improves.
2. **Fewest Severe Miles (`severe_miles`)**:
   - Minimizing exposure to severe conditions (e.g. winds $\ge 45\text{ mph}$, snow $> 2\text{ in/hr}$, or $> 40,000\text{ lb}$ load in $35\text{--}44\text{ mph}$ wind).
3. **Fewest High Miles (`high_miles`)**:
   - Minimizing high weather risk exposure ($35\text{--}44\text{ mph}$ wind, $0.25\text{--}0.50\text{ in/hr}$ rain, $1.0\text{--}2.0\text{ in/hr}$ snow).
4. **Lowest Average Risk (`avg_risk`)**:
   - Distance-weighted average risk score.
   - **Tie Tolerance Rule (`AVG_RISK_TIE_TOLERANCE = 0.05`)**: If the difference in average risk between two routes is $\le 0.05$, the safety profiles are treated as equivalent.
5. **Shortest Travel Duration (`duration_min`)**:
   - Duration only breaks ties after higher-priority safety metrics are equivalent within tolerance.

---

## 3. Checkpoint Segment Distance Weighting

To accurately compute route exposure in miles without distortion, each checkpoint represents a segment:
- Let checkpoints be at miles $m_0, m_1, m_2, \dots, m_{n-1}$.
- **Start checkpoint ($i=0$)**: $w_0 = \frac{m_1 - m_0}{2}$
- **Intermediate checkpoints ($0 < i < n-1$)**: $w_i = \frac{m_{i+1} - m_{i-1}}{2} = \frac{m_{i+1} - m_i}{2} + \frac{m_i - m_{i-1}}{2}$
- **End checkpoint ($i=n-1$)**: $w_{n-1} = \frac{m_{n-1} - m_{n-2}}{2}$
- **Invariant**: $\sum_{i=0}^{n-1} w_i = m_{n-1} - m_0 = \text{total route distance}$.

---

## 4. Worked Example: 45,000 lb Load Comparison

Consider a truck departing Chicago, IL for Indianapolis, IN carrying a **45,000 lb** load.

Three alternative routes are discovered:

| Route Metric | Route A | Route B | Route C |
|---|---|---|---|
| **Reported Distance** | 320 miles | 290 miles | 275 miles |
| **Duration** | 6 hr 20 min (380 min) | 5 hr 45 min (345 min) | 5 hr 10 min (310 min) |
| **Wind at Mile 100** | 20 mph | 40 mph | 56 mph |
| **Rain / Snow** | 0.0 / 0.0 | 0.15 in/hr rain / 0.0 | 0.0 / 0.0 |
| **Load Weight** | 45,000 lb | 45,000 lb | 45,000 lb |

### Step 1: Checkpoint Risk Classification
- **Route A (Mile 100)**:
  - Wind 20 mph $\rightarrow$ LOW
  - Rain 0.0 $\rightarrow$ LOW
  - Base: LOW. Load rule does not trigger.
  - Final Checkpoint Level: **LOW** (driver: None)
- **Route B (Mile 100)**:
  - Wind 40 mph $\rightarrow$ HIGH
  - Rain 0.15 in/hr $\rightarrow$ MODERATE
  - Base: HIGH
  - **Load Rule Trigger**: Wind in $35\text{--}44\text{ mph}$ with load $> 40,000\text{ lb}$ elevates risk to **SEVERE**!
  - Final Checkpoint Level: **SEVERE** (driver: `load_rule`)
- **Route C (Mile 100)**:
  - Wind 56 mph $\ge 55\text{ mph}$ $\rightarrow$ **NO TRAVEL** for any load (driver: `wind`).

### Step 2: Route Metrics Calculation
- **Route A**: `severe_miles = 0`, `high_miles = 0`, `no_travel_miles = 0`, `avg_risk = 0.30`, `duration = 380 min`
- **Route B**: `severe_miles = 35`, `high_miles = 67`, `no_travel_miles = 0`, `avg_risk = 1.20`, `duration = 345 min`
- **Route C**: `severe_miles = 0`, `no_travel_miles = 50`, `max_level = NO_TRAVEL`

### Step 3: Recommendation Decision
1. **Safety Filter**: Route C contains 50 miles of No Travel conditions $\rightarrow$ **Disqualified** as not drivable.
2. **Compare Route A vs Route B**:
   - Route A has `0` severe miles.
   - Route B has `35` severe miles.
   - Route A has fewer severe miles $\rightarrow$ **Route A wins!**
3. **Engine Explanation**:
   > *"Route A is recommended: Alternative route(s) (Route C) contain hazardous No Travel weather conditions and are not drivable. Avoids 35.0 miles of severe weather exposure present on Route B."*
