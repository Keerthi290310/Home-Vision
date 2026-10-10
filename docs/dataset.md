# Dataset notes

The supplied Beijing housing dataset contains 318,851 records and 26 source columns. Transaction dates span 2002-06-01 through 2018-01-28. It includes targets `totalPrice` and `DOM`, along with square area, room counts, floor, construction year, renovation condition, elevator, subway, district, coordinates, community average and other listing fields.

`totalPrice` has 318,851 valid positive records. `DOM` has 160,874 valid non-negative records; 157,977 DOM values are missing. The two targets are trained independently so missing DOM does not discard otherwise valid price records. DOM is strongly skewed: 69,162 valid records have DOM equal to 1 day, so DOM estimates are approximate.

The training script converts mixed room/construction fields to numeric values, extracts numeric floor and transaction date components, imputes missing features and encodes categorical columns. URL/ID/Cid and the alternate `price` field are excluded from model inputs. The source does not provide a trustworthy code-to-name mapping for numeric-coded categories, so the dashboard keeps those codes explicit instead of inventing labels.

The dataset is historical Beijing data; it does not establish reliable predictions for other regions or today's market.
