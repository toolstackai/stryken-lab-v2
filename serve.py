# Servidor local sin caché: al editar un archivo y recargar, el navegador siempre ve la versión nueva.
# Uso: python serve.py            (puerto 8080)
#      python serve.py 5181       (otro puerto)
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass


print(f'STRYKEN en http://localhost:{PORT}')
http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()
