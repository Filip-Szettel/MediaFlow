# MediaFlow

#### Tytuł projektu  

Indywidualny projekt koncepcyjny: Prototyp zaawansowanego front-endu dla FFmpeg-a – platforma do zarządzania mediami z naciskiem na konwersję plików wideo (w koncepcjach PWA i SPA)  

#### Wstęp i kontekst  

Projekt koncepcyjny ma na celu opracowanie wstępnej wizji i prototypu interfejsu użytkownika (UI/UX) dla platformy webowej służącej do zarządzania plikami multimedialnymi, z kluczowym skupieniem na konwersję wideo. Inspiracją jest popularne narzędzie FFmpeg, które umożliwia zaawansowane przetwarzanie multimediów, ale brakuje mu intuicyjnego, skalowalnego front-endu dostosowanego do potrzeb użytkowników nietechnicznych (np. twórców treści, marketerów czy małych firm). W odróżnieniu od projektu wdrożeniowego, ten etap skupia się na fazie koncepcyjnej: analizie wymagań, modelowaniu i prototypowaniu, bez pełnej implementacji backendu, integracji z serwerem czy testów produkcyjnych.  

Projekt będzie realizowany wyłącznie w czystym Node.js (dla symulacji procesów serwerowych), JavaScript (vanilla ES6+), CSS (standardowe moduły i media queries) oraz HTML5, wykorzystując obecny potencjał tych technologii bez dołączania zbędnych bibliotek zewnętrznych (np. brak React, Vue czy Bootstrap). Podejście to minimalizuje problemy z kompatybilnością (obsługa starszych przeglądarek via polyfills tylko jeśli niezbędne), rozwojem (łatwość modyfikacji kodu źródłowego) i skalowaniem (lekka struktura kodu, łatwa do rozszerzenia o moduły). Całość zostanie zaprojektowana w koncepcjach Progressive Web App (PWA) – z manifestem web app, service workerem dla offline caching i push notifications – oraz Single Page Application (SPA) – z dynamicznym routingiem via History API i AJAX-like requests, bez pełnego odświeżania strony. Projekt wpisuje się w efekty uczenia kierunku Informatyka, rozwijając umiejętności projektowania systemów interaktywnych, modelowania danych i kreatywnego rozwiązywania problemów w zakresie multimediów.  
