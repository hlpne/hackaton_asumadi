package ru.tram;

import ai.onnxruntime.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * Инференс моделей трамвайного прогноза в JVM через ONNX Runtime (зависимость одна — com.microsoft.onnxruntime).
 *
 * Режимы:
 *   validate [artifacts]  — сверка ONNX(JVM) с LightGBM(Python) на контрольных строках признаков
 *                           (artifacts/onnx/sample_features_*.csv против expected_*.csv);
 *   serve [artifacts]     — JVM-движок для потоковой модели: stream.py --engine jvm отправляет в stdin
 *                           матрицы признаков каждого дня, JVM возвращает прогнозы моделей в stdout.
 *
 * Протокол serve (бинарный, little-endian): запрос — строка "<файл.onnx> <n> <m>\n" и n*m float32;
 * ответ — n float32. Строка "quit\n" завершает работу. При старте печатается "READY\n".
 *
 * TramOnnxModel — удобная обёртка ансамбля: 3 конфигурации x 5 seed (среднее по seed) + модель профиля часов,
 * порядок признаков — из artifacts/manifest.json.
 */
public class TramOnnxInference {

    public static class TramOnnxModel implements AutoCloseable {
        private final OrtEnvironment env = OrtEnvironment.getEnvironment();
        private final List<List<OrtSession>> volume = new ArrayList<>();
        private final List<List<String>> volumeFeatures = new ArrayList<>();
        private final OrtSession shape;
        private final List<String> shapeFeatures = new ArrayList<>();

        public TramOnnxModel(Path artifacts) throws Exception {
            Map<String, Object> man = Json.parseObject(Files.readString(artifacts.resolve("manifest.json")));
            for (Object o : (List<?>) man.get("volume_models")) {
                Map<?, ?> vm = (Map<?, ?>) o;
                List<OrtSession> seeds = new ArrayList<>();
                for (Object f : (List<?>) vm.get("files")) seeds.add(env.createSession(onnxPath(artifacts, (String) f)));
                volume.add(seeds);
                List<String> fs = new ArrayList<>();
                for (Object x : (List<?>) vm.get("features")) fs.add((String) x);
                volumeFeatures.add(fs);
            }
            Map<?, ?> sm = (Map<?, ?>) man.get("shape_model");
            shape = env.createSession(onnxPath(artifacts, (String) sm.get("file")));
            for (Object x : (List<?>) sm.get("features")) shapeFeatures.add((String) x);
        }
        static String onnxPath(Path artifacts, String lgbFile) {
            return artifacts.resolve("onnx").resolve(lgbFile.replace(".txt", ".onnx")).toString();
        }
        public List<String> volumeFeatures(int cfg) { return volumeFeatures.get(cfg); }
        public List<String> shapeFeatures() { return shapeFeatures; }
        public int configs() { return volume.size(); }

        /** Сырой выход модели объёма конфигурации cfg: среднее по seed (до прибавления B и умножения на scale). */
        public float[] predictVolume(int cfg, float[][] x) throws OrtException {
            float[] acc = new float[x.length];
            for (OrtSession s : volume.get(cfg)) { float[] p = run(env, s, x); for (int i = 0; i < p.length; i++) acc[i] += p[i]; }
            for (int i = 0; i < acc.length; i++) acc[i] /= volume.get(cfg).size();
            return acc;
        }
        /** Сырой выход модели профиля часов (далее нормируется по суткам). */
        public float[] predictShape(float[][] x) throws OrtException { return run(env, shape, x); }
        @Override public void close() throws Exception {
            for (List<OrtSession> l : volume) for (OrtSession s : l) s.close();
            shape.close();
        }
    }

    static float[] run(OrtEnvironment env, OrtSession s, float[][] x) throws OrtException {
        try (OnnxTensor t = OnnxTensor.createTensor(env, x);
             OrtSession.Result r = s.run(Collections.singletonMap(s.getInputNames().iterator().next(), t))) {
            float[][] out = (float[][]) r.get(0).getValue();
            float[] v = new float[out.length];
            for (int i = 0; i < out.length; i++) v[i] = out[i][0];
            return v;
        }
    }

    // ---------------------------------------------------------------- validate
    static float[][] readCsv(Path p) throws IOException {
        List<String> lines = Files.readAllLines(p);
        float[][] x = new float[lines.size() - 1][];
        for (int i = 1; i < lines.size(); i++) {
            String[] parts = lines.get(i).split(",", -1);
            x[i - 1] = new float[parts.length];
            for (int j = 0; j < parts.length; j++) x[i - 1][j] = parts[j].isEmpty() ? Float.NaN : Float.parseFloat(parts[j]);
        }
        return x;
    }

    static void validate(Path art) throws Exception {
        try (TramOnnxModel m = new TramOnnxModel(art)) {
            double worst = 0;
            for (int c = 0; c < m.configs(); c++) {
                float[] p = m.predictVolume(c, readCsv(art.resolve("onnx/sample_features_cfg" + c + ".csv")));
                float[][] e = readCsv(art.resolve("onnx/expected_cfg" + c + ".csv"));
                for (int i = 0; i < p.length; i++) worst = Math.max(worst, Math.abs(p[i] - e[i][0]));
                System.out.printf("config %d (%d features x 5 seeds): %d rows, first %.6f (LightGBM %.6f)%n",
                        c, m.volumeFeatures(c).size(), p.length, p[0], e[0][0]);
            }
            float[] ps = m.predictShape(readCsv(art.resolve("onnx/sample_features_shape.csv")));
            float[][] es = readCsv(art.resolve("onnx/expected_shape.csv"));
            for (int i = 0; i < ps.length; i++) worst = Math.max(worst, Math.abs(ps[i] - es[i][0]));
            System.out.printf("shape: %d rows, first %.6f (LightGBM %.6f)%n", ps.length, ps[0], es[0][0]);
            System.out.printf("max |ONNX(JVM) - LightGBM(Python)| = %.2e%n", worst);
            if (worst > 1e-3) throw new IllegalStateException("mismatch");
            System.out.println("OK: JVM inference matches Python LightGBM");
        }
    }

    // ---------------------------------------------------------------- serve
    static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1 && c != '\n') b.write(c);
        if (c == -1 && b.size() == 0) return null;
        return b.toString(StandardCharsets.UTF_8).trim();
    }

    static void serve(Path art) throws Exception {
        OrtEnvironment env = OrtEnvironment.getEnvironment();
        Map<String, OrtSession> sessions = new HashMap<>();
        DataInputStream in = new DataInputStream(new BufferedInputStream(System.in, 1 << 16));
        OutputStream out = new BufferedOutputStream(System.out, 1 << 16);
        out.write("READY\n".getBytes(StandardCharsets.UTF_8)); out.flush();
        long calls = 0, rows = 0;
        String line;
        while ((line = readLine(in)) != null) {
            if (line.isEmpty()) continue;
            if (line.equals("quit")) break;
            String[] h = line.split(" ");
            String name = h[0]; int n = Integer.parseInt(h[1]), m = Integer.parseInt(h[2]);
            if (name.contains("/") || name.contains("\\") || !name.endsWith(".onnx")) throw new IllegalArgumentException(name);
            OrtSession s = sessions.get(name);
            if (s == null) { s = env.createSession(art.resolve("onnx").resolve(name).toString()); sessions.put(name, s); }
            byte[] buf = new byte[n * m * 4]; in.readFully(buf);
            ByteBuffer bb = ByteBuffer.wrap(buf).order(ByteOrder.LITTLE_ENDIAN);
            float[][] x = new float[n][m];
            for (int i = 0; i < n; i++) for (int j = 0; j < m; j++) x[i][j] = bb.getFloat();
            float[] p = run(env, s, x);
            ByteBuffer ob = ByteBuffer.allocate(n * 4).order(ByteOrder.LITTLE_ENDIAN);
            for (float v : p) ob.putFloat(v);
            out.write(ob.array()); out.flush();
            calls++; rows += n;
        }
        for (OrtSession s : sessions.values()) s.close();
        System.err.printf("[jvm] ONNX Runtime %s: %d calls, %d rows, %d models%n",
                OrtEnvironment.getEnvironment().getVersion(), calls, rows, sessions.size());
    }

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "validate";
        Path art = Paths.get(args.length > 1 ? args[1] : "../artifacts");
        if (mode.equals("serve")) serve(art);
        else if (mode.equals("validate")) validate(art);
        else { System.err.println("usage: (validate|serve) [artifacts_dir]"); System.exit(2); }
    }

    /** Минимальный JSON-парсер (объекты, массивы, строки, числа, true/false/null) — чтобы не тянуть зависимости. */
    static final class Json {
        private final String s; private int i;
        private Json(String s) { this.s = s; }
        @SuppressWarnings("unchecked")
        static Map<String, Object> parseObject(String text) { return (Map<String, Object>) new Json(text).value(); }
        private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
        private Object value() {
            ws(); char c = s.charAt(i);
            if (c == '{') { i++; Map<String, Object> m = new LinkedHashMap<>(); ws();
                if (s.charAt(i) == '}') { i++; return m; }
                while (true) { ws(); String k = str(); ws(); i++; /* ':' */ m.put(k, value()); ws();
                    if (s.charAt(i++) == '}') return m; } }
            if (c == '[') { i++; List<Object> l = new ArrayList<>(); ws();
                if (s.charAt(i) == ']') { i++; return l; }
                while (true) { l.add(value()); ws(); if (s.charAt(i++) == ']') return l; } }
            if (c == '"') return str();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int st = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            return Double.parseDouble(s.substring(st, i));
        }
        private String str() {
            StringBuilder b = new StringBuilder(); i++;
            while (true) { char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c == '\\') { char e = s.charAt(i++);
                    switch (e) {
                        case 'n': b.append('\n'); break; case 't': b.append('\t'); break;
                        case 'r': b.append('\r'); break; case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(e);
                    } }
                else b.append(c); }
        }
    }
}
