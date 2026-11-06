import http.server
import ssl

server_address = ('0.0.0.0', 8001)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Ativa o SSL com os arquivos gerados pelo mkcert
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile="10.156.50.186+2.pem", keyfile="10.156.50.186+2-key.pem")

httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
print("Servidor seguro rodando em https://10.156.50.186:8001")
httpd.serve_forever()
