


# "Open letter" animation for letter texts

When encountering a part of a chapter that is a letter (e.g. in XXXV of Pride and Prejudice), the user should have to swipe open the wax seal (a red embossed wax seal in center screen), and then the text unfolds from the center, with cursive font on "parchment" background

Example: regency_letter.png




# Improve quotation attribution

Use offline LLM
Have it run multiple times, and have it vote on 

# Improve speaker


Goal: We should expand the speaker attributes to be used as input
Goal: Include audio tags in quotation attribution (e.g. [angry], [sarcastic], [whisper], etc.), and baseline character attributes for speed/style/stability


Setting	What it does
stability	Lower = more expressive/random. Higher = consistent/flat
similarity_boost	Keeps closer to source/cloned voice
style	Extra dramatic/exaggerated delivery
speed	Speech rate
speaker_boost	Improves clarity/presence

Character
Mr. Bennet (more stable, slower)
{
  "voice_settings": {
    "stability": 0.4,  // Mr. Bennet = higher 0.6, Mrs. Bennet = lower 0.4
    "similarity_boost": 0.8,
    "style": 0.7,
    "speed": 1.0,  // Mr. Bennet = lower, Mrs. Bennet = higher
    "speaker_boost": false // unless in noisy scene
  }
}



# Future Chapter Annotation

Goal: We should annotate chapters to provide additional data for a more theatric reading experience (definitely soundscape and location data)

Potential suggestion for future AI-annotation of chapters, which can be rendered theatrically in the e-book.

```
{
  "book_id": "book_pride_prejudice",
  "chapters": [
    {
      "chapter_id": "ch_001",
      "chapter_number": 1,
      "title": "Chapter 1",

      "scenes": [
        {
          // DO NOW
          "scene_id": "sc_001",

          "soundscape": {
            "description": "Low HVAC hum and distant clinking of breakfast dishes",
            "file": "file1.mp3"
          },


          "setting": {
            "location": {
              "description": "An old worn-down roadside hotel",
              // any specifics known
              "city": "Tucson",
              "state": "AZ",
              "country": "USA",
            },

            "time": {
              "season": "winter",
              "time_of_day": "morning",
              "year": 1998
              "date": null, // or "unknown"
            },

          
          "embedded_texts": [
            {
              "type": "letter",
              "start_paragraph_id": "p_010",
              "end_paragraph_id": "p_014",

              "sender": "char_unknown",
              "recipient": "char_john",

              "style": {
                "display_mode": "indented",
                "font_style": "handwritten"
              },

              "summary": "A threatening anonymous letter warning John to leave town."
            }
          ],

          // LEAVE FOR LATER

            "atmosphere": [
              "cold",
              "quiet",
              "slightly tense"
            ]
          },

          "characters_present": [
            "char_john",
            "char_mary"
          ],


        }
      ]
    }
  ],

  "characters": [ "char_john", "char_mary" ]  // points to characters json
}

```