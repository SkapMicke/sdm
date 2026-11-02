# Bildarkiv i SDM

## Aktivera

1. Öppna SQL Editor i det befintliga Supabase-projektet. Kör hela `supabase/photos.sql` en gång. Det skapar tabellen, en privat lagringsbucket och åtkomstregler per användare. Skriptet ska inte köras om efter att tabellen har skapats.
2. Publicera de uppdaterade webbplatsfilerna tillsammans med `photos.js` och `photos.css` på appens befintliga webbhotell. Ingen ny inloggning behövs.
3. Logga in via **Mer → Molnsynk**. Öppna **Bilder** och prova först med två bilder. Kontrollera original, vattenstämpel, stjärnmärkning, papperskorg och återställning från en annan enhet med samma konto.
4. Kontrollera lagringsutrymme, trafikgränser och maximal filstorlek i Supabase innan en stor import. Bucketens gräns är 50 MB per fil; projektets globala gräns måste också tillåta filerna.

## Beteende

- JPEG, PNG och WebP stöds. RAW och HEIC behöver konverteras före uppladdning. Bildbehandling begränsas till 80 megapixel och kan begränsas ytterligare av enhetens minne.
- Två bilder behandlas parallellt. Originalet ändras inte. En JPEG-kopia får vattenstämpeln `@ Simons Dansmedia` nere till höger och en liten miniatyrbild används i galleriet.
- Filer skickas med TUS i 6 MB-delar och automatiska återförsök vid överföringsfel. Se https://supabase.com/docs/guides/storage/uploads/resumable-uploads.
- Behåll webbläsarfliken öppen och enheten vaken. Andra flikar inne i SDM-appen kan användas. Kön finns i minnet: efter omladdning behöver återstående filer väljas igen. Redan färdiga bilder finns i molnet. Ingen automatisk dubblettidentifiering ingår.
- Misslyckade bilder kan köras igen med samma bild-ID under den öppna sessionen. En bild visas först när original, vattenstämpel och miniatyr har laddats upp. Avbrutna sessioner kan lämna ofärdiga poster (`ready=false`) och filer som en administratör får städa via Storage och SQL. Radera lagringsfiler via Storage API/dashboard, inte direkt i storage-tabellerna.
- Favoriter grupperas efter uppladdningsdatum i Europe/Stockholm. Datumet sätts av servern när uppladdningsposten skapas, inte när stjärnan klickas.
- Galleriet visar 60 bilder per sida. Markera alla gäller den visade sidan.
- Radering flyttar till papperskorgen. Bilder ligger kvar där tills de återställs eller raderas permanent. Permanent radering tar bort alla tre filerna och därefter databasposten. Vid delvis fel kan åtgärden köras igen.
- Länkar till bilder är tidsbegränsade. Uppdatera galleriet om förhandsvisningar har slutat visas. Alla databas- och lagringsanrop skyddas av Supabase RLS.

## Säkerhetskopiering

Separat säkerhetskopiering är **inte aktiverad** av dessa filer. Behåll originalen lokalt och ordna en oberoende kopia av både Storage-filerna och tabellen `photos`. Appens vanliga JSON-export omfattar inte bildarkivet. En databasbackup ensam innehåller inte bildfilerna. Ingen garanti om obegränsad lagring eller lagring för alltid lämnas.

## Verifiering före full import

Testa två separata konton: konto B ska varken kunna läsa konto A:s poster eller ladda ned A:s lagringsfiler. Testa nätavbrott, återförsök, kvotfel och en större bild innan en import med tusentals bilder. Produktionslagring, RLS och uppladdningsprestanda måste verifieras mot det konfigurerade Supabase-projektet.
