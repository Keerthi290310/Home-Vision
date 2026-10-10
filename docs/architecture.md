# HomeVision Architecture

`new.csv` → preprocessing → independent Price and DOM pipelines → API → dashboard.

The scenario layer accepts modified property inputs and reruns both saved pipelines, then computes price/DOM changes relative to the first scenario.
