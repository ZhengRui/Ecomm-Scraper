from flask import Flask, request, render_template
from gevent.pywsgi import WSGIServer
import json
import os

app = Flask(__name__)


@app.route('/')
def serv():
    return render_template('base.html')


@app.route('/get_listof_taxonomy')
def get_listof_taxonomy():
    succeed = 1
    try:
        layers = [taxo.split('.')[0].replace('_taxonomy', '') for taxo in os.listdir('static/json')]
    except Exception as err:
        succeed = 0
        print(err)

    return json.dumps(
        {'succeed': succeed, 'layers': layers}
        if succeed else
        {'succeed': succeed, 'error': 'Taxonomy listing error.'})


@app.route('/get_taxonomy', methods=['POST'])
def get_taxonomy():
    layer = request.form['layer']
    succeed = 1
    try:
        taxonomy = json.load(open(os.path.join('static', 'json', layer+'_taxonomy.json'), 'rb'))
    except Exception as err:
        succeed = 0
        print(err)

    return json.dumps(
        {'succeed': succeed, 'taxonomy': taxonomy}
        if succeed else
        {'succeed': succeed, 'error': 'Taxonomy fetching error.'})


@app.route('/bounce_taxonomy', methods=['POST'])
def bounce_taxonomy():
    succeed = 1
    try:
        taxo_file = request.files['file']
        taxo_filename = taxo_file.filename
        assert '.' in taxo_filename and taxo_filename.rsplit('.', 1)[1].lower() == 'json'
        taxo = json.loads(taxo_file.read())
    except Exception as err:
        succeed = 0
        print(err)

    return json.dumps(
        {'succeed': succeed, 'taxonomy': taxo}
        if succeed else
        {'succeed': succeed, 'error': 'Json file uploading error.'})


if __name__ == '__main__':
    http_server = WSGIServer(('', 5000), app)
    http_server.serve_forever()
