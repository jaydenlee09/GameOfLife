// Wardrobe item definitions.
// Each item is unlocked at a specific player level.
// Slot: 'head' | 'top' | 'bottom' | 'accessory'
// Add new items here as you add new PNGs to src/assets/clothing/

import blackShirt from '../assets/clothing/black_shirt.png';
import knitSweater from '../assets/clothing/knit_sweater.png';

const WARDROBE_ITEMS = [
  {
    id: 'black_shirt',
    name: 'Black Shirt',
    slot: 'top',
    image: blackShirt,
    unlockLevel: 1,
  },
  {
    id: 'knit_sweater',
    name: 'Knit Sweater',
    slot: 'top',
    image: knitSweater,
    unlockLevel: 1,
  },
  // Example future items — add your PNGs and uncomment:
  // {
  //   id: 'red_cap',
  //   name: 'Red Cap',
  //   slot: 'head',
  //   image: redCap,       // import redCap from '../assets/clothing/red_cap.png';
  //   unlockLevel: 2,
  // },
  // {
  //   id: 'blue_pants',
  //   name: 'Blue Pants',
  //   slot: 'bottom',
  //   image: bluePants,    // import bluePants from '../assets/clothing/blue_pants.png';
  //   unlockLevel: 3,
  // },
  // {
  //   id: 'gold_chain',
  //   name: 'Gold Chain',
  //   slot: 'accessory',
  //   image: goldChain,    // import goldChain from '../assets/clothing/gold_chain.png';
  //   unlockLevel: 5,
  // },
];

export default WARDROBE_ITEMS;
