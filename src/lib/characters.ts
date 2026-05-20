// Character aliases per book, used for color-coded name highlighting.
// Each character has canonical name + aliases (titles, nicknames, married names).
// colorVar references --char-1 … --char-20 in index.css (longest alias matches first in readerUtils).

export interface CharacterDef {
  name: string;
  aliases: string[];
  colorVar: string;
}

const C = {
  rose: "--char-1",
  blue: "--char-2",
  green: "--char-3",
  amber: "--char-4",
  violet: "--char-5",
  teal: "--char-6",
  rust: "--char-7",
  olive: "--char-8",
  plum: "--char-9",
  gold: "--char-10",
  sky: "--char-11",
  sea: "--char-12",
  orchid: "--char-13",
  coral: "--char-14",
  sage: "--char-15",
  blush: "--char-16",
  indigo: "--char-17",
  moss: "--char-18",
  copper: "--char-19",
  lilac: "--char-20",
};

export const CHARACTERS_BY_BOOK: Record<string, CharacterDef[]> = {
  "mansfield-park": [
    {
      name: "Fanny Price",
      colorVar: C.rose,
      aliases: ["Fanny Price", "Miss Price", "Miss Fanny Price", "Fanny", "Miss Fanny"],
    },
    {
      name: "Edmund Bertram",
      colorVar: C.blue,
      aliases: ["Edmund Bertram", "Mr. Edmund Bertram", "Mr Edmund Bertram", "Edmund"],
    },
    {
      name: "Sir Thomas Bertram",
      colorVar: C.green,
      aliases: ["Sir Thomas Bertram", "Sir Thomas"],
    },
    {
      name: "Lady Bertram",
      colorVar: C.amber,
      aliases: ["Lady Bertram"],
    },
    {
      name: "Mrs. Norris",
      colorVar: C.violet,
      aliases: ["Mrs. Norris", "Mrs Norris", "Aunt Norris"],
    },
    {
      name: "Henry Crawford",
      colorVar: C.teal,
      aliases: ["Henry Crawford", "Mr. Henry Crawford", "Mr Henry Crawford"],
    },
    {
      name: "Mary Crawford",
      colorVar: C.rust,
      aliases: ["Mary Crawford", "Miss Crawford", "Miss Mary Crawford"],
    },
    {
      name: "Tom Bertram",
      colorVar: C.olive,
      aliases: ["Tom Bertram", "Mr. Tom Bertram", "Mr Tom Bertram", "Tom"],
    },
    {
      name: "Maria Bertram",
      colorVar: C.plum,
      aliases: ["Maria Bertram", "Miss Bertram", "Maria Rushworth", "Mrs Rushworth", "Mrs. Rushworth"],
    },
    {
      name: "Julia Bertram",
      colorVar: C.gold,
      aliases: ["Julia Bertram", "Miss Julia Bertram", "Julia"],
    },
    {
      name: "William Price",
      colorVar: C.sky,
      aliases: ["William Price", "Mr. William Price", "Mr William Price", "William"],
    },
    {
      name: "Susan Price",
      colorVar: C.sea,
      aliases: ["Susan Price", "Miss Susan Price", "Susan"],
    },
    {
      name: "Mr. Rushworth",
      colorVar: C.orchid,
      aliases: ["Mr. Rushworth", "Mr Rushworth", "James Rushworth", "Mr. James Rushworth", "Rushworth"],
    },
    {
      name: "Mr. Yates",
      colorVar: C.coral,
      aliases: ["Mr. Yates", "Mr Yates", "Charles Yates", "Mr. Charles Yates"],
    },
    {
      name: "Dr. Grant",
      colorVar: C.sage,
      aliases: ["Dr. Grant", "Dr Grant", "Mr. Grant", "Mr Grant"],
    },
    {
      name: "Mrs. Grant",
      colorVar: C.blush,
      aliases: ["Mrs. Grant", "Mrs Grant"],
    },
    {
      name: "Admiral Crawford",
      colorVar: C.indigo,
      aliases: ["Admiral Crawford"],
    },
    {
      name: "Mrs. Price",
      colorVar: C.moss,
      aliases: ["Mrs. Price", "Mrs Price"],
    },
    {
      name: "Mr. Price",
      colorVar: C.copper,
      aliases: ["Mr. Price", "Mr Price"],
    },
  ],

  "pride-and-prejudice": [
    {
      name: "Elizabeth Bennet",
      colorVar: C.rose,
      aliases: [
        "Elizabeth Bennet",
        "Miss Elizabeth Bennet",
        "Miss Eliza Bennet",
        "Elizabeth",
        "Lizzy",
        "Eliza",
      ],
    },
    {
      name: "Fitzwilliam Darcy",
      colorVar: C.blue,
      aliases: ["Fitzwilliam Darcy", "Mr. Darcy", "Mr Darcy", "Darcy"],
    },
    {
      name: "Jane Bennet",
      colorVar: C.green,
      aliases: ["Jane Bennet", "Miss Bennet", "Jane"],
    },
    {
      name: "Charles Bingley",
      colorVar: C.amber,
      aliases: ["Charles Bingley", "Mr. Bingley", "Mr Bingley", "Bingley"],
    },
    {
      name: "George Wickham",
      colorVar: C.violet,
      aliases: ["George Wickham", "Mr. Wickham", "Mr Wickham", "Wickham"],
    },
    {
      name: "William Collins",
      colorVar: C.teal,
      aliases: ["William Collins", "Mr. Collins", "Mr Collins", "Collins"],
    },
    {
      name: "Lydia Bennet",
      colorVar: C.rust,
      aliases: ["Lydia Bennet", "Lydia Wickham", "Mrs. Wickham", "Mrs Wickham", "Miss Lydia", "Lydia"],
    },
    {
      name: "Lady Catherine de Bourgh",
      colorVar: C.olive,
      aliases: ["Lady Catherine de Bourgh", "Lady Catherine"],
    },
    {
      name: "Mr. Bennet",
      colorVar: C.plum,
      aliases: ["Mr. Bennet", "Mr Bennet"],
    },
    {
      name: "Mrs. Bennet",
      colorVar: C.gold,
      aliases: ["Mrs. Bennet", "Mrs Bennet"],
    },
    {
      name: "Charlotte Lucas",
      colorVar: C.sky,
      aliases: [
        "Charlotte Lucas",
        "Charlotte Collins",
        "Mrs. Collins",
        "Mrs Collins",
        "Charlotte",
        "Miss Lucas",
      ],
    },
    {
      name: "Caroline Bingley",
      colorVar: C.sea,
      aliases: ["Caroline Bingley", "Miss Bingley", "Caroline"],
    },
    {
      name: "Mr. Gardiner",
      colorVar: C.orchid,
      aliases: ["Mr. Gardiner", "Mr Gardiner", "Edward Gardiner"],
    },
    {
      name: "Mrs. Gardiner",
      colorVar: C.coral,
      aliases: ["Mrs. Gardiner", "Mrs Gardiner"],
    },
    {
      name: "Mary Bennet",
      colorVar: C.sage,
      aliases: ["Mary Bennet", "Miss Mary", "Miss Mary Bennet", "Mary"],
    },
    {
      name: "Kitty Bennet",
      colorVar: C.blush,
      aliases: ["Kitty Bennet", "Catherine Bennet", "Miss Catherine Bennet", "Miss Kitty", "Kitty"],
    },
    {
      name: "Georgiana Darcy",
      colorVar: C.indigo,
      aliases: ["Georgiana Darcy", "Miss Darcy", "Georgiana"],
    },
    {
      name: "Colonel Fitzwilliam",
      colorVar: C.moss,
      aliases: ["Colonel Fitzwilliam", "Mr. Fitzwilliam", "Mr Fitzwilliam"],
    },
    {
      name: "Anne de Bourgh",
      colorVar: C.copper,
      aliases: ["Anne de Bourgh", "Miss de Bourgh"],
    },
    {
      name: "Maria Lucas",
      colorVar: C.lilac,
      aliases: ["Maria Lucas", "Miss Maria Lucas", "Miss Maria", "Maria"],
    },
  ],

  "sense-and-sensibility": [
    {
      name: "Elinor Dashwood",
      colorVar: C.rose,
      aliases: ["Elinor Dashwood", "Miss Dashwood", "Elinor"],
    },
    {
      name: "Marianne Dashwood",
      colorVar: C.blue,
      aliases: ["Marianne Dashwood", "Miss Marianne Dashwood", "Miss Marianne", "Marianne"],
    },
    {
      name: "Mrs. Dashwood",
      colorVar: C.green,
      aliases: ["Mrs. Dashwood", "Mrs Dashwood"],
    },
    {
      name: "Edward Ferrars",
      colorVar: C.amber,
      aliases: ["Edward Ferrars", "Mr. Edward Ferrars", "Mr Edward Ferrars", "Mr. Ferrars", "Mr Ferrars", "Edward"],
    },
    {
      name: "Colonel Brandon",
      colorVar: C.violet,
      aliases: ["Colonel Brandon", "Mr. Brandon", "Mr Brandon", "Brandon"],
    },
    {
      name: "John Willoughby",
      colorVar: C.teal,
      aliases: ["John Willoughby", "Mr. Willoughby", "Mr Willoughby", "Willoughby"],
    },
    {
      name: "Lucy Steele",
      colorVar: C.rust,
      aliases: ["Lucy Steele", "Lucy Ferrars", "Lucy", "Miss Steele"],
    },
    {
      name: "Anne Steele",
      colorVar: C.olive,
      aliases: ["Anne Steele", "Miss Anne Steele", "Anne"],
    },
    {
      name: "Mrs. Jennings",
      colorVar: C.plum,
      aliases: ["Mrs. Jennings", "Mrs Jennings"],
    },
    {
      name: "John Dashwood",
      colorVar: C.gold,
      aliases: ["John Dashwood", "Mr. John Dashwood", "Mr John Dashwood"],
    },
    {
      name: "Fanny Dashwood",
      colorVar: C.sky,
      aliases: ["Fanny Dashwood", "Mrs. John Dashwood", "Mrs John Dashwood", "Fanny"],
    },
    {
      name: "Margaret Dashwood",
      colorVar: C.sea,
      aliases: ["Margaret Dashwood", "Miss Margaret", "Margaret"],
    },
    {
      name: "Sir John Middleton",
      colorVar: C.orchid,
      aliases: ["Sir John Middleton", "Sir John"],
    },
    {
      name: "Lady Middleton",
      colorVar: C.coral,
      aliases: ["Lady Middleton"],
    },
    {
      name: "Charlotte Palmer",
      colorVar: C.sage,
      aliases: ["Charlotte Palmer", "Mrs. Palmer", "Mrs Palmer", "Charlotte"],
    },
    {
      name: "Mr. Palmer",
      colorVar: C.blush,
      aliases: ["Mr. Palmer", "Mr Palmer"],
    },
    {
      name: "Robert Ferrars",
      colorVar: C.indigo,
      aliases: ["Robert Ferrars", "Mr. Robert Ferrars", "Mr Robert Ferrars"],
    },
    {
      name: "Mrs. Ferrars",
      colorVar: C.moss,
      aliases: ["Mrs. Ferrars", "Mrs Ferrars"],
    },
    {
      name: "Mr. Pratt",
      colorVar: C.copper,
      aliases: ["Mr. Pratt", "Mr Pratt"],
    },
    {
      name: "Miss Morton",
      colorVar: C.lilac,
      aliases: ["Miss Morton"],
    },
  ],

  emma: [
    {
      name: "Emma Woodhouse",
      colorVar: C.rose,
      aliases: ["Emma Woodhouse", "Miss Woodhouse", "Emma"],
    },
    {
      name: "George Knightley",
      colorVar: C.blue,
      aliases: ["George Knightley", "Mr. Knightley", "Mr Knightley", "Mr. George Knightley", "Knightley"],
    },
    {
      name: "Harriet Smith",
      colorVar: C.green,
      aliases: ["Harriet Smith", "Miss Smith", "Harriet"],
    },
    {
      name: "Frank Churchill",
      colorVar: C.amber,
      aliases: ["Frank Churchill", "Mr. Frank Churchill", "Mr Frank Churchill", "Frank"],
    },
    {
      name: "Jane Fairfax",
      colorVar: C.violet,
      aliases: ["Jane Fairfax", "Miss Fairfax", "Jane Fairfax Churchill", "Jane"],
    },
    {
      name: "Philip Elton",
      colorVar: C.teal,
      aliases: ["Mr. Elton", "Mr Elton", "Philip Elton", "Mr. Philip Elton"],
    },
    {
      name: "Augusta Elton",
      colorVar: C.rust,
      aliases: ["Mrs. Elton", "Mrs Elton", "Augusta Elton", "Augusta Hawkins", "Mrs. Augusta Elton"],
    },
    {
      name: "Mr. Woodhouse",
      colorVar: C.olive,
      aliases: ["Mr. Woodhouse", "Mr Woodhouse"],
    },
    {
      name: "Mr. Weston",
      colorVar: C.plum,
      aliases: ["Mr. Weston", "Mr Weston"],
    },
    {
      name: "Mrs. Weston",
      colorVar: C.gold,
      aliases: ["Mrs. Weston", "Mrs Weston", "Miss Taylor"],
    },
    {
      name: "John Knightley",
      colorVar: C.sky,
      aliases: ["John Knightley", "Mr. John Knightley", "Mr John Knightley"],
    },
    {
      name: "Isabella Knightley",
      colorVar: C.sea,
      aliases: ["Isabella Knightley", "Isabella Woodhouse", "Mrs. John Knightley", "Mrs John Knightley", "Isabella"],
    },
    {
      name: "Miss Bates",
      colorVar: C.orchid,
      aliases: ["Miss Bates"],
    },
    {
      name: "Mrs. Bates",
      colorVar: C.coral,
      aliases: ["Mrs. Bates", "Mrs Bates"],
    },
    {
      name: "Mr. Perry",
      colorVar: C.sage,
      aliases: ["Mr. Perry", "Mr Perry"],
    },
    {
      name: "Mrs. Goddard",
      colorVar: C.blush,
      aliases: ["Mrs. Goddard", "Mrs Goddard"],
    },
    {
      name: "Mr. Churchill",
      colorVar: C.indigo,
      aliases: ["Mr. Churchill", "Mr Churchill"],
    },
    {
      name: "Mrs. Churchill",
      colorVar: C.moss,
      aliases: ["Mrs. Churchill", "Mrs Churchill"],
    },
    {
      name: "Colonel Campbell",
      colorVar: C.copper,
      aliases: ["Colonel Campbell", "Mr. Campbell", "Mr Campbell"],
    },
    {
      name: "Mrs. Dixon",
      colorVar: C.lilac,
      aliases: ["Mrs. Dixon", "Mrs Dixon"],
    },
  ],

  persuasion: [
    {
      name: "Anne Elliot",
      colorVar: C.rose,
      aliases: ["Anne Elliot", "Miss Anne Elliot", "Miss Anne", "Anne Wentworth", "Mrs Wentworth", "Mrs. Wentworth", "Anne"],
    },
    {
      name: "Captain Wentworth",
      colorVar: C.blue,
      aliases: ["Captain Wentworth", "Captain Frederick Wentworth", "Frederick Wentworth", "Mr. Wentworth", "Mr Wentworth"],
    },
    {
      name: "Sir Walter Elliot",
      colorVar: C.green,
      aliases: ["Sir Walter Elliot", "Sir Walter"],
    },
    {
      name: "Elizabeth Elliot",
      colorVar: C.amber,
      aliases: ["Elizabeth Elliot", "Miss Elliot"],
    },
    {
      name: "Mary Musgrove",
      colorVar: C.violet,
      aliases: ["Mary Musgrove", "Mary Elliot", "Mrs. Charles Musgrove", "Mrs Charles Musgrove", "Mary"],
    },
    {
      name: "Charles Musgrove",
      colorVar: C.teal,
      aliases: ["Charles Musgrove", "Charles"],
    },
    {
      name: "Mr. Musgrove",
      colorVar: C.moss,
      aliases: ["Mr. Musgrove", "Mr Musgrove"],
    },
    {
      name: "Henrietta Musgrove",
      colorVar: C.rust,
      aliases: ["Henrietta Musgrove", "Miss Henrietta", "Henrietta"],
    },
    {
      name: "Louisa Musgrove",
      colorVar: C.olive,
      aliases: ["Louisa Musgrove", "Miss Louisa", "Louisa"],
    },
    {
      name: "William Elliot",
      colorVar: C.plum,
      aliases: ["William Elliot", "Mr. Elliot", "Mr Elliot", "Mr. William Elliot"],
    },
    {
      name: "Lady Russell",
      colorVar: C.gold,
      aliases: ["Lady Russell"],
    },
    {
      name: "Admiral Croft",
      colorVar: C.sky,
      aliases: ["Admiral Croft"],
    },
    {
      name: "Mrs. Croft",
      colorVar: C.sea,
      aliases: ["Mrs. Croft", "Mrs Croft", "Sophia Croft"],
    },
    {
      name: "Captain Harville",
      colorVar: C.orchid,
      aliases: ["Captain Harville", "Mr. Harville", "Mr Harville", "Mrs. Harville", "Mrs Harville"],
    },
    {
      name: "Captain Benwick",
      colorVar: C.coral,
      aliases: ["Captain Benwick", "James Benwick", "Mr. Benwick", "Mr Benwick"],
    },
    {
      name: "Mrs. Clay",
      colorVar: C.sage,
      aliases: ["Mrs. Clay", "Mrs Clay", "Alice Clay"],
    },
    {
      name: "Mrs. Musgrove",
      colorVar: C.blush,
      aliases: ["Mrs. Musgrove", "Mrs Musgrove"],
    },
    {
      name: "Charles Hayter",
      colorVar: C.indigo,
      aliases: ["Charles Hayter", "Mr. Hayter", "Mr Hayter"],
    },
    {
      name: "Mr. Shepherd",
      colorVar: C.copper,
      aliases: ["Mr. Shepherd", "Mr Shepherd"],
    },
    {
      name: "Lady Dalrymple",
      colorVar: C.lilac,
      aliases: ["Lady Dalrymple", "the Dowager Viscountess Dalrymple"],
    },
  ],

  "northanger-abbey": [
    {
      name: "Catherine Morland",
      colorVar: C.rose,
      aliases: ["Catherine Morland", "Miss Morland", "Miss Catherine Morland", "Catherine"],
    },
    {
      name: "Henry Tilney",
      colorVar: C.blue,
      aliases: ["Henry Tilney", "Mr. Henry Tilney", "Mr Henry Tilney", "Mr. Tilney", "Mr Tilney", "Henry"],
    },
    {
      name: "Eleanor Tilney",
      colorVar: C.green,
      aliases: ["Eleanor Tilney", "Miss Tilney", "Miss Eleanor Tilney", "Eleanor"],
    },
    {
      name: "General Tilney",
      colorVar: C.amber,
      aliases: ["General Tilney", "the General"],
    },
    {
      name: "Captain Tilney",
      colorVar: C.violet,
      aliases: ["Captain Tilney", "Frederick Tilney", "Captain Frederick Tilney", "Mr. Frederick Tilney"],
    },
    {
      name: "Isabella Thorpe",
      colorVar: C.teal,
      aliases: ["Isabella Thorpe", "Miss Thorpe", "Miss Isabella Thorpe", "Isabella"],
    },
    {
      name: "John Thorpe",
      colorVar: C.rust,
      aliases: ["John Thorpe", "Mr. Thorpe", "Mr Thorpe", "Mr. John Thorpe", "John"],
    },
    {
      name: "James Morland",
      colorVar: C.olive,
      aliases: ["James Morland", "Mr. James Morland", "Mr James Morland", "James"],
    },
    {
      name: "Mr. Morland",
      colorVar: C.plum,
      aliases: ["Mr. Morland", "Mr Morland"],
    },
    {
      name: "Mrs. Morland",
      colorVar: C.gold,
      aliases: ["Mrs. Morland", "Mrs Morland"],
    },
    {
      name: "Mrs. Allen",
      colorVar: C.sky,
      aliases: ["Mrs. Allen", "Mrs Allen"],
    },
    {
      name: "Mr. Allen",
      colorVar: C.sea,
      aliases: ["Mr. Allen", "Mr Allen"],
    },
    {
      name: "Mrs. Thorpe",
      colorVar: C.orchid,
      aliases: ["Mrs. Thorpe", "Mrs Thorpe"],
    },
    {
      name: "Anne Thorpe",
      colorVar: C.coral,
      aliases: ["Anne Thorpe", "Miss Anne Thorpe"],
    },
    {
      name: "Maria Thorpe",
      colorVar: C.sage,
      aliases: ["Maria Thorpe", "Miss Maria Thorpe", "Maria"],
    },
    {
      name: "Sarah Morland",
      colorVar: C.blush,
      aliases: ["Sarah Morland", "Miss Sarah Morland", "Sarah", "Sally Morland", "Sally"],
    },
    {
      name: "Harriet Morland",
      colorVar: C.indigo,
      aliases: ["Harriet Morland", "Miss Harriet Morland", "Harriet"],
    },
    {
      name: "George Morland",
      colorVar: C.moss,
      aliases: ["George Morland"],
    },
    {
      name: "Edward Morland",
      colorVar: C.copper,
      aliases: ["Edward Morland"],
    },
    {
      name: "Miss Andrews",
      colorVar: C.lilac,
      aliases: ["Miss Andrews"],
    },
  ],
};

export function getCharactersForBook(bookId: string): CharacterDef[] {
  return CHARACTERS_BY_BOOK[bookId] || [];
}

/** Resolve a canonical {@link CharacterDef.name} to its palette slot (CSS variable name). */
export function getColorVarForSpeakerName(bookId: string | undefined, canonicalName: string): string | undefined {
  if (!bookId) return undefined;
  const needle = canonicalName.trim();
  if (!needle) return undefined;
  for (const c of getCharactersForBook(bookId)) {
    if (c.name === needle) return c.colorVar;
  }
  return undefined;
}
