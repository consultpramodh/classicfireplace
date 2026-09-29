# Valor — 10 Fireplace Image Pilot

This pilot maps 10 current Valor gas fireplace engine items to official Valor product pages and representative configured-fireplace images.

**Important:** these images are official Valor-hosted website assets referenced by URL. They are not copied into this public repository. The images show configured fireplaces (engine + media/liner/front), so they are appropriate as representative engine/series images but should not be reused as exact component images without separate validation.

Source catalog: **Valor 2026 MSRP CDN Price List**, effective 2026-02-18, revision 2026-08-21.

| # | Item Number | Fireplace | Paired LPG SKU | MSRP CAD | Official Image |
|---:|---|---|---|---:|---|
| 1 | 200AN | P2 Gas Fireplace — NG Engine | 200AP | $3,675 | [View](https://www.valorfireplaces.com/media/responsive/fireplaces/p2/p2-rcb-lsk.jpg) |
| 2 | 530VN | Portrait ZC Gas Fireplace — NG Engine | 530VP | $2,986 | [View](https://www.valorfireplaces.com/media/responsive/fireplaces/portrait/536-LSK.jpg) |
| 3 | 534VN | Horizon Gas Fireplace — NG V-Class Engine | 534VP | $3,323 | [View](https://www.valorfireplaces.com/media/responsive/fireplaces/horizon/setting-clearview-vrl.jpg) |
| 4 | 1000MN | H3 Gas Fireplace — NG Engine | 1000MP | $4,012 | [View](https://www.valorfireplaces.com/media/ResponsiveGraphics/installs/h3/birch-heatshift.jpg) |
| 5 | 1100MN | H5 Gas Fireplace — NG Engine | 1100MP | $4,991 | [View](https://www.valorfireplaces.com/media/responsive/fireplaces/h5/h5-gbl-setting.jpg) |
| 6 | 1400MN | H6 Gas Fireplace — NG Engine | 1400MP | $6,503 | [View](https://www.valorfireplaces.com/media/responsive/fireplaces/h6/h6-gbl-setting.jpg) |
| 7 | 1500KN | L1 Linear Gas Fireplace — NG Engine | 1500KP | $5,512 | [View](https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l1/birchv2-rgl-cik.jpg) |
| 8 | 1600KN | L1 See-Thru Linear — NG Engine | 1600KP | $6,775 | [View](https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l1-2sided/birchv2-rgl.jpg) |
| 9 | 1700KN | L2 Linear Gas Fireplace — NG Engine | 1700KP | $6,709 | [View](https://www.valorfireplaces.com/media/responsive/fireplaces/l2-linear/setting-birch-v2.jpg) |
| 10 | 1800KN | L3 Linear Gas Fireplace — NG Engine | 1800KP | $7,390 | [View](https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l3/birch-rgl-inch.jpg) |

## Image previews

### 200AN — P2
![Valor P2](https://www.valorfireplaces.com/media/responsive/fireplaces/p2/p2-rcb-lsk.jpg)

### 530VN — Portrait ZC
![Valor Portrait](https://www.valorfireplaces.com/media/responsive/fireplaces/portrait/536-LSK.jpg)

### 534VN — Horizon
![Valor Horizon](https://www.valorfireplaces.com/media/responsive/fireplaces/horizon/setting-clearview-vrl.jpg)

### 1000MN — H3
![Valor H3](https://www.valorfireplaces.com/media/ResponsiveGraphics/installs/h3/birch-heatshift.jpg)

### 1100MN — H5
![Valor H5](https://www.valorfireplaces.com/media/responsive/fireplaces/h5/h5-gbl-setting.jpg)

### 1400MN — H6
![Valor H6](https://www.valorfireplaces.com/media/responsive/fireplaces/h6/h6-gbl-setting.jpg)

### 1500KN — L1
![Valor L1](https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l1/birchv2-rgl-cik.jpg)

### 1600KN — L1 See-Thru
![Valor L1 See-Thru](https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l1-2sided/birchv2-rgl.jpg)

### 1700KN — L2
![Valor L2](https://www.valorfireplaces.com/media/responsive/fireplaces/l2-linear/setting-birch-v2.jpg)

### 1800KN — L3
![Valor L3](https://www.valorfireplaces.com/media/ResponsiveGraphics/products/l3/birch-rgl-inch.jpg)

## Next integration step

Resolve each Valor Item Number to its Striven Item ID, call `GET /v1/items/{id}/images` to avoid duplicates, then use the image URL in this manifest as the source file for the Striven image upload flow. The exact `POST /v1/items/{id}/images` request contract still needs to be verified before implementing the uploader.


## Striven Item IDs resolved

The current Striven Central Data Hub `DATA_ITEMS` dataset was used to resolve the exact internal Striven Item IDs before calling the item-detail endpoint.

| Valor Item | Striven Item ID | Live detail endpoint | Live image endpoint |
|---|---:|---|---|
| 200AN | 39799 | `GET /v1/items/39799` | `GET /v1/items/39799/images` |
| 530VN | 42895 | `GET /v1/items/42895` | `GET /v1/items/42895/images` |
| 534VN | 41479 | `GET /v1/items/41479` | `GET /v1/items/41479/images` |
| 1000MN | 41622 | `GET /v1/items/41622` | `GET /v1/items/41622/images` |
| 1100MN | 37548 | `GET /v1/items/37548` | `GET /v1/items/37548/images` |
| 1400MN | 36083 | `GET /v1/items/36083` | `GET /v1/items/36083/images` |
| 1500KN | 36045 | `GET /v1/items/36045` | `GET /v1/items/36045/images` |
| 1600KN | 24098 | `GET /v1/items/24098` | `GET /v1/items/24098/images` |
| 1700KN | 24111 | `GET /v1/items/24111` | `GET /v1/items/24111/images` |
| 1800KN | 36046 | `GET /v1/items/36046` | `GET /v1/items/36046/images` |

## Direct Striven collector

`striven-collector.gs` is a read-only Google Apps Script collector for these 10 items.

Run:

`valorPilot10_collectFromStriven()`

It performs one token request if needed, then for each fireplace calls both:

- `GET /v1/items/{id}`
- `GET /v1/items/{id}/images`

It validates that the Item Number returned by Striven exactly matches the expected Valor SKU before accepting the result. No Striven write endpoint is called.
